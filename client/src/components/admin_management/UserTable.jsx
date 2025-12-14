import React, { useEffect, useMemo, useState } from 'react';
import CreateUser from './subsections/CreateUser';

import '../common/TableStyles.css';
import '../currencies_management/CurrencyRatesTable.css'; 

const pageSize = 20;

const toDate = (value) => {
	if (!value) return null;
	const d = new Date(value);
	return Number.isNaN(d.getTime()) ? null : d;
};

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

const userDisplayName = (user) => {
	if (!user) return 'this user';
	const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
	return name || user.email || 'this user';
};



export default function UserTable() {
	const [users, setUsers] = useState([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');
	const [sortBy, setSortBy] = useState('createdAt');
	const [sortDir, setSortDir] = useState('desc');
	const [page, setPage] = useState(1);
	const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
	const [actionModal, setActionModal] = useState(null);
	const [roleModal, setRoleModal] = useState(null);

	const loadUsers = () => {
		let cancelled = false;
		const controller = new AbortController();
		setLoading(true);

		(async () => {
			try {
				const res = await fetch('/api/users', { credentials: 'include', signal: controller.signal });
				if (!res.ok) {
					const payload = await res.json().catch(() => ({}));
					throw new Error(payload && payload.error ? payload.error : 'Failed to load users');
				}
				const data = await res.json();
				if (cancelled) return;

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
				setError(err.message || 'Failed to load users');
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
				throw new Error(data && data.error ? data.error : 'Failed to update user');
			}

			setActionModal(null);
			loadUsers();
		} catch (err) {
			setError(err.message || 'Failed to update user');
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
				throw new Error(data && data.error ? data.error : 'Failed to change role');
			}

			setRoleModal(null);
			loadUsers();
		} catch (err) {
			setError(err.message || 'Failed to change role');
			setRoleModal((prev) => (prev ? { ...prev, loading: false } : prev));
		}
	};

	return (
		<div>
			{error && <div className="error" style={{ marginBottom: 12 }}>{error}</div>}

			<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
				<div className="headline">Users</div>
				<button 
					className="action-btn" 
					onClick={() => setIsCreateModalOpen(true)}
					style={{ fontSize: '0.95rem', fontWeight: '500' }}
				>
					Create New +
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
						<div className="spinner" aria-hidden="true" />
						<span>Loading users...</span>
					</div>
				)}
				<table className="curr-table">
					<thead>
						<tr>
							<th onClick={() => onHeaderClick('firstName')}>First Name {sortBy === 'firstName' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</th>
							<th onClick={() => onHeaderClick('lastName')}>Last Name {sortBy === 'lastName' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</th>
							<th onClick={() => onHeaderClick('email')}>Email {sortBy === 'email' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</th>
							<th onClick={() => onHeaderClick('role')}>Role {sortBy === 'role' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</th>
							<th onClick={() => onHeaderClick('createdAt')}>Created At {sortBy === 'createdAt' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</th>
							<th onClick={() => onHeaderClick('lastLogin')}>Last Login {sortBy === 'lastLogin' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</th>
							<th onClick={() => onHeaderClick('isDeleted')}>Status {sortBy === 'isDeleted' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</th>
							<th style={{ textAlign: 'center' }}>Actions</th>
						</tr>
					</thead>
					<tbody>
						{pageRows.map((u) => (
							<tr key={u.id}>
								<td>{u.firstName || '—'}</td>
								<td>{u.lastName || '—'}</td>
								<td>{u.email || '—'}</td>
								<td>{formatRole(u.role)}</td>
								<td>{formatDateTime(u.createdAt)}</td>
								<td>{formatDateTime(u.lastLogin)}</td>
								<td>
									<span className={`status-pill ${u.isDeleted ? 'user-status-deleted' : 'user-status-active'}`}>
										{u.isDeleted ? 'Deactivated' : 'Active'}
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
											{u.isDeleted ? 'Activate' : 'Deactivate'}
										</button>
										<button
											className="action-btn ghost"
											type="button"
											onClick={() => openRoleModal(u)}
											disabled={loading || (roleModal && roleModal.loading)}
										>
											Change Role
										</button>
									</div>
								</td>
							</tr>
						))}
						{pageRows.length === 0 && !loading && (
							<tr><td colSpan={7} className="no-data-cell">No users found</td></tr>
						)}
					</tbody>
				</table>
			</div>

			{actionModal && (
				<div className="modal-overlay">
					<div className="modal-content">
						<div className="modal-title">{actionModal.mode === 'deactivate' ? 'Deactivate user?' : 'Activate user?'}</div>
						<p style={{ margin: '4px 0 12px', color: '#d4d4d4' }}>
							Are you sure you want to {actionModal.mode === 'deactivate' ? 'deactivate' : 'activate'} {userDisplayName(actionModal.user)}?
						</p>
						<div className="modal-actions">
							<button className="btn-cancel" onClick={closeActionModal} disabled={actionModal.loading}>No</button>
							<button className="btn-confirm" onClick={handleConfirmAction} disabled={actionModal.loading}>
								{actionModal.loading ? 'Working...' : 'Yes'}
							</button>
						</div>
					</div>
				</div>
			)}

			{roleModal && (
				<div className="modal-overlay">
					<div className="modal-content">
						<div className="modal-title">Change role?</div>
						<p style={{ margin: '4px 0 12px', color: '#d4d4d4' }}>
							Change role for {userDisplayName(roleModal.user)}. Are you sure?
						</p>
						<label className="muted" style={{ display: 'block', marginBottom: 8 }}>Select new role</label>
						<select
							value={roleModal.role}
							onChange={(e) => setRoleModal((prev) => (prev ? { ...prev, role: e.target.value } : prev))}
							disabled={roleModal.loading}
							style={{ width: '100%', padding: '8px 10px', marginBottom: 12 }}
						>
							<option value="user">User</option>
							<option value="admin">Admin</option>
						</select>
						<div className="modal-actions">
							<button className="btn-cancel" onClick={closeRoleModal} disabled={roleModal.loading}>No</button>
							<button className="btn-confirm" onClick={handleConfirmRoleChange} disabled={roleModal.loading}>
								{roleModal.loading ? 'Working...' : 'Yes'}
							</button>
						</div>
					</div>
				</div>
			)}

			<div className="pagination">
				<div className="muted">Showing {Math.min((page - 1) * pageSize + 1, total)} - {Math.min(page * pageSize, total)} of {total}</div>
				<div className="pagination-controls">
					<button onClick={() => setPage(1)} disabled={page === 1}>« First</button>
					<button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>‹ Prev</button>
					<span>Page {page} / {totalPages}</span>
					<button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next ›</button>
					<button onClick={() => setPage(totalPages)} disabled={page === totalPages}>Last »</button>
				</div>
			</div>
		</div>
	);
}