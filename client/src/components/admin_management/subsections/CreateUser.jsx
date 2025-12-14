import React, { useState } from 'react';
import './CreateUser.css';

export default function CreateUser({ isOpen, onClose, onSuccess }) {
	// Form state
	const [firstName, setFirstName] = useState('');
	const [lastName, setLastName] = useState('');
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [role, setRole] = useState('User');
	const [loading, setLoading] = useState(false);

	// UI state
	const [createError, setCreateError] = useState('');

	const resetForm = () => {
		setFirstName('');
		setLastName('');
		setEmail('');
		setPassword('');
		setRole('User');
		setCreateError('');
	};

	const handleClose = () => {
		resetForm();
		onClose();
	};

	const validateEmail = (email) => {
		const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		return re.test(email);
	};

	const handleSubmit = async () => {
		setCreateError('');

		// Frontend Validation
		if (!firstName.trim()) {
			setCreateError('First name is required');
			return;
		}

		if (!lastName.trim()) {
			setCreateError('Last name is required');
			return;
		}

		if (!email.trim()) {
			setCreateError('Email is required');
			return;
		}

		if (!validateEmail(email)) {
			setCreateError('Please enter a valid email address');
			return;
		}

		if (!password) {
			setCreateError('Password is required');
			return;
		}

		if (password.length < 6) {
			setCreateError('Password must be at least 6 characters long');
			return;
		}

		setLoading(true);

		try {
			const payload = {
				firstName: firstName.trim(),
				lastName: lastName.trim(),
				email: email.trim(),
				password: password,
				role: role
			};

			const res = await fetch('/api/users/create', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload),
				credentials: 'include'
			});

			const data = await res.json();

			if (res.status === 201) {
				// Success - reset and close
				resetForm();
				setLoading(false);
				if (onSuccess) onSuccess();
				onClose();
			} else {
				// Error
				setCreateError(data.error || 'Failed to create user');
				setLoading(false);
			}
		} catch (err) {
			setCreateError('Network error');
			setLoading(false);
		}
	};

	if (!isOpen) return null;

	return (
		<div className="modal-overlay">
			<div className="modal-content">
				<div className="modal-title">Create New User</div>

				{createError && <div className="error-msg">{createError}</div>}

				<div className="form-group">
					<label>First Name</label>
					<input
						type="text"
						placeholder="Enter first name"
						value={firstName}
						onChange={(e) => setFirstName(e.target.value)}
						disabled={loading}
					/>
				</div>

				<div className="form-group">
					<label>Last Name</label>
					<input
						type="text"
						placeholder="Enter last name"
						value={lastName}
						onChange={(e) => setLastName(e.target.value)}
						disabled={loading}
					/>
				</div>

				<div className="form-group">
					<label>Email</label>
					<input
						type="email"
						placeholder="Enter email"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						disabled={loading}
					/>
				</div>

				<div className="form-group">
					<label>Role</label>
					<select
						value={role}
						onChange={(e) => setRole(e.target.value)}
						disabled={loading}
					>
						<option value="user">User</option>
						<option value="admin">Admin</option>
					</select>
				</div>

				<div className="form-group">
					<label>Password</label>
					<input
						type="password"
						placeholder="Enter password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						disabled={loading}
					/>
				</div>

				<div className="modal-actions">
					<button className="btn-cancel" onClick={handleClose} disabled={loading}>
						Cancel
					</button>
					<button className="btn-confirm" onClick={handleSubmit} disabled={loading}>
						{loading ? 'Creating...' : 'Create User'}
					</button>
				</div>
			</div>
		</div>
	);
}
