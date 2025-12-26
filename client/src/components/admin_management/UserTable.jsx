import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import CreateUser from './subsections/CreateUser';

import '../common/TableStyles.css';
import '../currencies_management/CurrencyRatesTable.css'; 

const pageSize = 20;

// Try to convert a value to a valid Date object, or return null
const toDate = (value) => {
	if (!value) return null;
	const d = new Date(value);
	return Number.isNaN(d.getTime()) ? null : d;
};

// Format a date/time nicely for table cells
const formatDateTime = (value) => {
	const d = toDate(value);
	if (!d) return '—';
	return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}`;
};


// Ensure role displays with capitalized first letter
const formatRole = (role) => {
	if (!role) return '—';
	const r = String(role).toLowerCase();
	if (r === 'user') return 'User';
	if (r === 'admin') return 'Admin';
	return role;
};

// Convert DB BIT (0/1) to boolean
const parseIsDeleted = (value) => Boolean(Number(value?.data?.[0] ?? value));

// Build a friendly display name for a user
const userDisplayName = (user) => {
	if (!user) return 'this user';
	const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
	return name || user.email || 'this user';
};




export default function UserTable() {
	const { t } = useTranslation();
	
	// Data & UI state
	const [users, setUsers] = useState([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');
	const [sortBy, setSortBy] = useState('createdAt');
	const [sortDir, setSortDir] = useState('desc');
	const [page, setPage] = useState(1);
	const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
	const [actionModal, setActionModal] = useState(null);
	const [roleModal, setRoleModal] = useState(null);

	// Fetch user list from server with cancellation support
	const loadUsers = () => {
		let cancelled = false;
		const controller = new AbortController();
		setLoading(true);

		(async () => {
			try {
				const res = await fetch('/api/users', { credentials: 'include', signal: controller.signal });
				if (!res.ok) {
					const payload = await res.json().catch(() => ({}));
					throw new Error(payload && payload.error ? payload.error : t('UserTable.errorLoadUsers'));
				}
				const data = await res.json();
				if (cancelled) return;

				// Normalize server shape to client-friendly fields
				const normalized = (Array.isArray(data) ? data : []).map((u) => ({
					id: u.Id,
					firstName: u.FirstName || '',
					lastName: u.LastName || '',
					email: u.Email || '',
					role: u.Role || '',
					createdAt: u.CreatedAt || '',
					lastLogin: u.LastLogin || '',
					isDeleted: parseIsDeleted(u.IsDeleted),
				}));

				setUsers(normalized);
				setError('');
			} catch (err) {
				if (controller.signal.aborted || cancelled) return;
				setError(err.message || t('UserTable.errorLoadUsers'));
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();	

		return () => {
			cancelled = true;
			controller.abort();
		};
	};

	useEffect(() => {
		return loadUsers();
	}, []);

	const onHeaderClick = (key) => {
		setPage(1);
		if (sortBy === key) {
			setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
		} else {
			setSortBy(key);
			setSortDir('asc');
		}
	};

	const sorted = useMemo(() => {
		const arr = [...users];
		arr.sort((a, b) => {
			let va = a[sortBy];
			let vb = b[sortBy];

			if (va == null) return 1;
			if (vb == null) return -1;

			const da = toDate(va);
			const db = toDate(vb);
			if (da && db) {
				const diff = da.getTime() - db.getTime();
				return sortDir === 'asc' ? diff : -diff;
			}

			if (typeof va === 'string' && typeof vb === 'string') {
				const diff = va.localeCompare(vb);
				return sortDir === 'asc' ? diff : -diff;
			}

			const diff = va > vb ? 1 : va < vb ? -1 : 0;
			return sortDir === 'asc' ? diff : -diff;
		});
		return arr;
	}, [users, sortBy, sortDir]);

	const total = sorted.length;
	const totalPages = Math.max(1, Math.ceil(total / pageSize));
	const pageRows = useMemo(() => {
		const start = (page - 1) * pageSize;
		return sorted.slice(start, start + pageSize);
	}, [sorted, page]);

	const handleCreateSuccess = () => {
		loadUsers();
	};

	const openRoleModal = (user) => {
		setError('');
		const normalizedRole = String(user?.role || 'user').toLowerCase() === 'admin' ? 'admin' : 'user';
		setRoleModal({ user, role: normalizedRole, loading: false });
	};

	const closeRoleModal = () => {
		setRoleModal(null);
	};

	const openActionModal = (user, mode) => {
		setError('');
		setActionModal({ user, mode, loading: false });
	};

	const closeActionModal = () => {
		setActionModal(null);
	};

	const handleConfirmAction = async () => {
		if (!actionModal || !actionModal.user) return;

		setActionModal((prev) => (prev ? { ...prev, loading: true } : prev));
		setError('');

		try {
			const payload = {
				userId: actionModal.user.id,
				isDeleted: actionModal.mode === 'deactivate' ? 1 : 0,
			};

			const res = await fetch('/api/users/delete-user', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload),
				credentials: 'include',
			});

			const data = await res.json().catch(() => ({}));
			if (!res.ok) {
				throw new Error(data && data.error ? data.error : t('UserTable.errorUpdateUser'));
			}

			setActionModal(null);
			loadUsers();
		} catch (err) {
			setError(err.message || t('UserTable.errorUpdateUser'));
			setActionModal((prev) => (prev ? { ...prev, loading: false } : prev));
		}
	};

	const handleConfirmRoleChange = async () => {
		if (!roleModal || !roleModal.user) return;

		setRoleModal((prev) => (prev ? { ...prev, loading: true } : prev));
		setError('');

		try {
			const payload = {
				userId: roleModal.user.id,
				role: roleModal.role,
			};

			const res = await fetch('/api/users/change-role', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload),
				credentials: 'include',
			});

			const data = await res.json().catch(() => ({}));
			if (!res.ok) {
				throw new Error(data && data.error ? data.error : t('UserTable.errorChangeRole'));
			}

			setRoleModal(null);
			loadUsers();
		} catch (err) {
			setError(err.message || t('UserTable.errorChangeRole'));
			setRoleModal((prev) => (prev ? { ...prev, loading: false } : prev));
		}
	};

	return (
		<div>
			{error && <div className="error" style={{ marginBottom: 12 }}>{error}</div>}

			<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
				<div className="headline">{t('UserTable.title')}</div>
				<button 
					className="action-btn" 
					onClick={() => setIsCreateModalOpen(true)}
					style={{ fontSize: '0.95rem', fontWeight: '500' }}
				>
					{t('UserTable.createNew')}
				</button>
			</div>

			<CreateUser 
				isOpen={isCreateModalOpen} 
				onClose={() => setIsCreateModalOpen(false)} 
				onSuccess={handleCreateSuccess} 
			/>

			<div className="table-wrapper table-surface">
				{loading && (
					<div className="table-loading">
						<div className="spinner" aria-hidden={true} />
						<span>{t('UserTable.loading')}</span>
					</div>
				)}
				<table className="curr-table">
					<thead>
						<tr>
							<th onClick={() => onHeaderClick('firstName')}>{t('UserTable.headerFirstName')} {sortBy === 'firstName' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</th>
							<th onClick={() => onHeaderClick('lastName')}>{t('UserTable.headerLastName')} {sortBy === 'lastName' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</th>
							<th onClick={() => onHeaderClick('email')}>{t('UserTable.headerEmail')} {sortBy === 'email' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</th>
							<th onClick={() => onHeaderClick('role')}>{t('UserTable.headerRole')} {sortBy === 'role' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</th>
							<th onClick={() => onHeaderClick('createdAt')}>{t('UserTable.headerCreatedAt')} {sortBy === 'createdAt' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</th>
							<th onClick={() => onHeaderClick('lastLogin')}>{t('UserTable.headerLastLogin')} {sortBy === 'lastLogin' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</th>
							<th onClick={() => onHeaderClick('isDeleted')}>{t('UserTable.headerStatus')} {sortBy === 'isDeleted' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</th>
							<th style={{ textAlign: 'center' }}>{t('UserTable.actions')}</th>
						</tr>
					</thead>
					<tbody>
						{pageRows.map((u) => (
							<tr key={u.id}>
								<td>{u.firstName || '—'}</td>
								<td>{u.lastName || '—'}</td>
								<td>{u.email || '—'}</td>
								<td>{String((u.role || '').toLowerCase()) === 'admin' ? t('UserTable.roleOptionAdmin') : t('UserTable.roleOptionUser')}</td>
								<td>{formatDateTime(u.createdAt)}</td>
								<td>{formatDateTime(u.lastLogin)}</td>
								<td>
									<span className={`status-pill ${u.isDeleted ? 'user-status-deleted' : 'user-status-active'}`}>
										{u.isDeleted ? t('UserTable.statusDeactivated') : t('UserTable.statusActive')}
									</span>
								</td>
								<td>
									<div className="actions-cell">
										<button
											className="action-btn"
											type="button"
											onClick={() => openActionModal(u, u.isDeleted ? 'activate' : 'deactivate')}
											disabled={loading || (actionModal && actionModal.loading)}
										>
										{u.isDeleted ? t('UserTable.activate') : t('UserTable.deactivate')}
										</button>
										<button
											className="action-btn ghost"
											type="button"
											onClick={() => openRoleModal(u)}
											disabled={loading || (roleModal && roleModal.loading)}
										>
										{t('UserTable.changeRole')}
										</button>
									</div>
								</td>
							</tr>
						))}
						{pageRows.length === 0 && !loading && (
							<tr><td colSpan={7} className="no-data-cell">{t('UserTable.noData')}</td></tr>
						)}
					</tbody>
				</table>
			</div>

			{actionModal && (
				<div className="modal-overlay">
					<div className="modal-content">
						<div className="modal-title">{actionModal.mode === 'deactivate' ? t('UserTable.modalDeactivateTitle') : t('UserTable.modalActivateTitle')}</div>
						<p style={{ margin: '4px 0 12px', color: '#d4d4d4' }}>
							{t('UserTable.modalConfirmAction', { action: actionModal.mode === 'deactivate' ? t('UserTable.deactivate') : t('UserTable.activate'), user: userDisplayName(actionModal.user) })}
						</p>
						<div className="modal-actions">
							<button className="btn-cancel" onClick={closeActionModal} disabled={actionModal.loading}>{t('UserTable.modalNo')}</button>
							<button className="btn-confirm" onClick={handleConfirmAction} disabled={actionModal.loading}>
								{actionModal.loading ? t('UserTable.working') : t('UserTable.modalYes')}
							</button>
						</div>
					</div>
				</div>
			)}

			{roleModal && (
				<div className="modal-overlay">
					<div className="modal-content">
						<div className="modal-title">{t('UserTable.changeRoleTitle')}</div>
						<p style={{ margin: '4px 0 12px', color: '#d4d4d4' }}>
							{t('UserTable.changeRoleFor', { user: userDisplayName(roleModal.user) })}
						</p>
						<label className="muted" style={{ display: 'block', marginBottom: 8 }}>{t('UserTable.changeRoleLabel')}</label>
						<select
							value={roleModal.role}
							onChange={(e) => setRoleModal((prev) => (prev ? { ...prev, role: e.target.value } : prev))}
							disabled={roleModal.loading}
							style={{ width: '100%', padding: '8px 10px', marginBottom: 12 }}
						>
							<option value="user">{t('UserTable.roleOptionUser')}</option>
							<option value="admin">{t('UserTable.roleOptionAdmin')}</option>
						</select>
						<div className="modal-actions">
							<button className="btn-cancel" onClick={closeRoleModal} disabled={roleModal.loading}>{t('UserTable.modalNo')}</button>
							<button className="btn-confirm" onClick={handleConfirmRoleChange} disabled={roleModal.loading}>
								{roleModal.loading ? t('UserTable.working') : t('UserTable.modalYes')}
							</button>
						</div>
					</div>
				</div>
			)}

			<div className="pagination">
				<div className="muted">{t('UserTable.showing', { from: Math.min((page - 1) * pageSize + 1, total), to: Math.min(page * pageSize, total), total })}</div>
				<div className="pagination-controls">
					<button onClick={() => setPage(1)} disabled={page === 1}>« {t('UserTable.first')}</button>
					<button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>‹ {t('UserTable.prev')}</button>
					<span>{t('UserTable.page', { page, total: totalPages })}</span>
					<button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>{t('UserTable.next')} ›</button>
					<button onClick={() => setPage(totalPages)} disabled={page === totalPages}>{t('UserTable.last')} »</button>
				</div>
			</div>
		</div>
	);
}
