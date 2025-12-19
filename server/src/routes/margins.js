const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { protect } = require('../middleware/authMiddleware');

// Get current date in 'YYYY-MM-DD' format
const getTodayStr = () => new Date().toISOString().split('T')[0];

// GET /api/margins
router.get('/', protect, async (req, res) => {
  const { active } = req.query || {};
  const filters = [];

  // Active filter
  if (String(active).toLowerCase() === 'true') {
    filters.push('(m.StartDate <= CURRENT_DATE())');
    filters.push('(m.EndDate IS NULL OR m.EndDate >= CURRENT_DATE())');
  }

  const whereSql = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  try {
    const sql = `
      SELECT 
        m.Id,
        m.MarginValue,
        CAST(m.StartDate AS CHAR) as StartDate,
        CAST(m.EndDate AS CHAR) as EndDate,
        m.UserId,
        u.Email AS UserEmail,
        u.FirstName AS UserFirstName,
        u.LastName AS UserLastName
      FROM Margins m
      LEFT JOIN Users u ON u.Id = m.UserId
      ${whereSql}
      ORDER BY m.StartDate DESC, m.EndDate DESC, m.Id DESC
    `;

    const [rows] = await pool.query(sql);
    return res.json(rows || []);
  } catch (err) {
    console.error('GET /api/margins failed', err);
    return res.status(500).json({ error: 'DB error' });
  }
});

// GET /api/margins/history
// Returns all margins with their date ranges for chart visualization
router.get('/history', protect, async (req, res) => {
  try {
    const sql = `
      SELECT 
        m.Id,
        m.MarginValue,
        CAST(m.StartDate AS CHAR) as StartDate,
        CAST(m.EndDate AS CHAR) as EndDate,
        m.UserId,
        u.Email AS UserEmail,
        u.FirstName AS UserFirstName,
        u.LastName AS UserLastName
      FROM Margins m
      LEFT JOIN Users u ON u.Id = m.UserId
      ORDER BY m.StartDate ASC
    `;

    const [rows] = await pool.query(sql);
    return res.json(rows || []);
  } catch (err) {
    console.error('GET /api/margins/history failed', err);
    return res.status(500).json({ error: 'DB error' });
  }
});

// Add/Subtract days from date (string -> string) using UTC to avoid time shifts
const addDaysToDateStr = (dateStr, days) => {
  const date = new Date(dateStr + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().split('T')[0];
};

// POST /api/margins/create
router.post('/create', protect, async (req, res) => {
  const { marginValue, startDate, endDate, forceCreate } = req.body;
  const userId = req.user?.id;

  // Basic validation
  if (marginValue == null || isNaN(marginValue)) {
    return res.status(400).json({ error: 'Invalid margin value' });
  }
  if (!startDate) {
    return res.status(400).json({ error: 'Start date is required' });
  }

  const decimalValue = parseFloat(marginValue) / 100;
  const today = getTodayStr();

  // Cannot create future margins
  if (startDate > today) {
    return res.status(400).json({ 
      error: 'Future margins are not allowed. Start Date must be today or in the past.' 
    });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // CHECK: Exact StartDate match
    const [sameDayMargins] = await connection.query(
      'SELECT Id FROM Margins WHERE StartDate = ? LIMIT 1',
      [startDate]
    );

    if (sameDayMargins.length > 0) {
      await connection.rollback();
      return res.status(400).json({ 
        error: `A margin starting on ${startDate} already exists. You cannot create two margins with the same Start Date.` 
      });
    }

    // Neighbor processing logic
    const [existingMargins] = await connection.query(`
      SELECT Id, CAST(StartDate AS CHAR) as StartDate, CAST(EndDate AS CHAR) as EndDate 
      FROM Margins 
      ORDER BY StartDate ASC
    `);

    const newStart = startDate; 
    const newEnd = endDate || null;

    let previousMarginToClose = null; 
    let succeedingMarginToModify = null; 
    const marginsToDelete = []; 

    for (const m of existingMargins) {
      const mStart = m.StartDate;
      const mEnd = m.EndDate || '9999-12-31'; // for comparison

      // Find previous margin (to close)
      // It started before
      if (mStart < newStart) {
          // And it's still active or ends after our start
          if (mEnd === '9999-12-31' || mEnd >= newStart) {
              previousMarginToClose = m;
          }
      }
      
      // Find succeeding margin (to shift or delete)
      // This is the FIRST entry that starts STRICTLY AFTER our start.
      if (mStart > newStart && !succeedingMarginToModify) {
          succeedingMarginToModify = m;
      }
      
      // If new margin is infinite (no EndDate), collect all margins it will completely overlap
      if (!newEnd && mStart > newStart) {
          marginsToDelete.push(m.Id);
      }
    }
    
    // CONFLICT CHECK
    // If there are margins to modify and we are not in forceCreate mode -> ask for confirmation
    const needsConfirmation = (previousMarginToClose || succeedingMarginToModify) && !forceCreate;
    
    if (needsConfirmation) {
      await connection.rollback();
      return res.status(409).json({
        message: 'Conflict detected',
        // Pass data to frontend to show warning
        conflicts: {
            overlapping: [previousMarginToClose, succeedingMarginToModify].filter(Boolean)
        },
        confirmationRequired: true
      });
    }

    // APPLYING CHANGES
    // Close previous margin (cut to yesterday)
    if (previousMarginToClose) {
      const cutOffDate = addDaysToDateStr(newStart, -1);
      
      await connection.query(
        'UPDATE Margins SET EndDate = ? WHERE Id = ?',
        [cutOffDate, previousMarginToClose.Id]
      );
      
      // Clear MarginId for CurrencyRates that are no longer covered by this margin
      // (dates after the new cut-off date)
      await connection.query(
        'UPDATE CurrencyRates SET MarginId = NULL WHERE MarginId = ? AND Date > ?',
        [previousMarginToClose.Id, cutOffDate]
      );
    }

    // Process succeeding margin
    if (succeedingMarginToModify) {
        if (newEnd) {
            // If new margin has an end date
            const shiftedStartDate = addDaysToDateStr(newEnd, 1); 
            
            // Check that START doesn't go beyond its own end date
            const succeedingEndDate = succeedingMarginToModify.EndDate || '9999-12-31';

            if (shiftedStartDate <= succeedingEndDate) {
                await connection.query(
                    'UPDATE Margins SET StartDate = ? WHERE Id = ?',
                    [shiftedStartDate, succeedingMarginToModify.Id]
                );
                
                // Clear MarginId for CurrencyRates that are no longer covered by this margin
                // (dates before the new start date, including the new margin's period)
                await connection.query(
                  'UPDATE CurrencyRates SET MarginId = NULL WHERE MarginId = ? AND Date < ?',
                  [succeedingMarginToModify.Id, shiftedStartDate]
                );
            } else {
                // If we shifted the start so far that the margin disappeared -> delete it
                 await connection.query(
                    'DELETE FROM Margins WHERE Id = ?',
                    [succeedingMarginToModify.Id]
                );
                
                // Clear MarginId for all CurrencyRates that were linked to this deleted margin
                await connection.query(
                  'UPDATE CurrencyRates SET MarginId = NULL WHERE MarginId = ?',
                  [succeedingMarginToModify.Id]
                );
            }

        } else {
            // If new margin is infinite, delete all future margins
            if (marginsToDelete.length > 0) {
                 // First, clear MarginId for all CurrencyRates linked to margins being deleted
                 await connection.query(
                     `UPDATE CurrencyRates SET MarginId = NULL WHERE MarginId IN (?)`,
                     [marginsToDelete]
                 );
                 
                 // Then delete the margins
                 await connection.query(
                     `DELETE FROM Margins WHERE Id IN (?)`,
                     [marginsToDelete]
                 );
            }
        }
    }

    // Insert new margin
    const insertResult = await connection.query(
      'INSERT INTO Margins (MarginValue, StartDate, EndDate, UserId) VALUES (?, ?, ?, ?)',
      [decimalValue, startDate, newEnd, userId]
    );
    
    // Get the newly created margin ID
    const newMarginId = insertResult[0].insertId;
    
    // UPDATE MarginId for CurrencyRates that fall within the new margin's date range
    // This ensures all currency rates in this period are linked to the new margin
    if (newEnd) {
      // Margin has both start and end date
      await connection.query(
        'UPDATE CurrencyRates SET MarginId = ? WHERE Date >= ? AND Date <= ?',
        [newMarginId, startDate, newEnd]
      );
    } else {
      // Margin is infinite (no end date) - all dates from startDate onwards
      await connection.query(
        'UPDATE CurrencyRates SET MarginId = ? WHERE Date >= ?',
        [newMarginId, startDate]
      );
    }

    await connection.commit();
    return res.status(201).json({ success: true, message: 'Margin created' });

  } catch (err) {
    await connection.rollback();
    console.error('Create margin failed', err);
    res.status(500).json({ error: err.message });
  } finally {
    connection.release();
  }
});




/***/


// PUT /api/margins/update/:id
// Update an existing margin and shift neighboring margins if needed
router.put('/update/:id', protect, async (req, res) => {
  const marginId = req.params.id;
  const { marginValue, startDate, endDate } = req.body;
  const userId = req.user?.id;

  if (marginValue == null || isNaN(marginValue)) {
    return res.status(400).json({ error: 'Invalid margin value' });
  }
  if (!startDate) {
    return res.status(400).json({ error: 'Start date is required' });
  }

  const decimalValue = parseFloat(marginValue) / 100;
  const today = getTodayStr();
  if (startDate > today) {
    return res.status(400).json({ error: 'Future margins are not allowed. Start Date must be today or in the past.' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Fetch current margin
    const [currentRows] = await connection.query(
      'SELECT Id, CAST(StartDate AS CHAR) as StartDate, CAST(EndDate AS CHAR) as EndDate FROM Margins WHERE Id = ? LIMIT 1',
      [marginId]
    );

    if (currentRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Margin not found' });
    }

    // Prevent exact StartDate collision with other margins
    const [sameDay] = await connection.query(
      'SELECT Id FROM Margins WHERE StartDate = ? AND Id != ? LIMIT 1',
      [startDate, marginId]
    );
    if (sameDay.length > 0) {
      await connection.rollback();
      return res.status(400).json({ error: `A margin starting on ${startDate} already exists.` });
    }

    // Load all other margins ordered by StartDate ASC
    const [existingMargins] = await connection.query(`
      SELECT Id, CAST(StartDate AS CHAR) as StartDate, CAST(EndDate AS CHAR) as EndDate 
      FROM Margins 
      WHERE Id != ?
      ORDER BY StartDate ASC
    `, [marginId]);

    const newStart = startDate;
    const newEnd = endDate || null;

    let previousMarginToClose = null;
    let succeedingMarginToModify = null;
    const marginsToDelete = [];

    for (const m of existingMargins) {
      const mStart = m.StartDate;
      const mEnd = m.EndDate || '9999-12-31';

      if (mStart < newStart) {
        if (mEnd === '9999-12-31' || mEnd >= newStart) {
          previousMarginToClose = m;
        }
      }

      if (mStart > newStart && !succeedingMarginToModify) {
        succeedingMarginToModify = m;
      }

      if (!newEnd && mStart > newStart) {
        marginsToDelete.push(m.Id);
      }
    }

    // Close previous margin (cut to yesterday)
    if (previousMarginToClose) {
      const cutOffDate = addDaysToDateStr(newStart, -1);
      await connection.query('UPDATE Margins SET EndDate = ? WHERE Id = ?', [cutOffDate, previousMarginToClose.Id]);
      await connection.query('UPDATE CurrencyRates SET MarginId = NULL WHERE MarginId = ? AND Date > ?', [previousMarginToClose.Id, cutOffDate]);
    }

    // Process succeeding margin
    if (succeedingMarginToModify) {
      if (newEnd) {
        const shiftedStartDate = addDaysToDateStr(newEnd, 1);
        const succeedingEndDate = succeedingMarginToModify.EndDate || '9999-12-31';

        if (shiftedStartDate <= succeedingEndDate) {
          await connection.query('UPDATE Margins SET StartDate = ? WHERE Id = ?', [shiftedStartDate, succeedingMarginToModify.Id]);
          await connection.query('UPDATE CurrencyRates SET MarginId = NULL WHERE MarginId = ? AND Date < ?', [succeedingMarginToModify.Id, shiftedStartDate]);
        } else {
          await connection.query('DELETE FROM Margins WHERE Id = ?', [succeedingMarginToModify.Id]);
          await connection.query('UPDATE CurrencyRates SET MarginId = NULL WHERE MarginId = ?', [succeedingMarginToModify.Id]);
        }

      } else {
        if (marginsToDelete.length > 0) {
          await connection.query('UPDATE CurrencyRates SET MarginId = NULL WHERE MarginId IN (?)', [marginsToDelete]);
          await connection.query('DELETE FROM Margins WHERE Id IN (?)', [marginsToDelete]);
        }
      }
    }

    // Update the margin record
    await connection.query(
      'UPDATE Margins SET MarginValue = ?, StartDate = ?, EndDate = ?, UserId = ? WHERE Id = ?',
      [decimalValue, newStart, newEnd, userId, marginId]
    );

    // Update CurrencyRates to point to this margin where appropriate
    if (newEnd) {
      await connection.query('UPDATE CurrencyRates SET MarginId = ? WHERE Date >= ? AND Date <= ?', [marginId, newStart, newEnd]);
    } else {
      await connection.query('UPDATE CurrencyRates SET MarginId = ? WHERE Date >= ?', [marginId, newStart]);
    }

    await connection.commit();
    return res.json({ success: true, message: 'Margin updated' });

  } catch (err) {
    await connection.rollback();
    console.error('Update margin failed', err);
    res.status(500).json({ error: err.message });
  } finally {
    connection.release();
  }
});

/***/








module.exports = router;