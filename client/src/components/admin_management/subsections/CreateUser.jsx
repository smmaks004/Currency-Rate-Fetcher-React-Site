import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import './CreateUser.css';

export default function CreateUser({ isOpen, onClose, onSuccess }) {
	const { t } = useTranslation();

	// Form state
	const [firstName, setFirstName] = useState('');
	const [lastName, setLastName] = useState('');
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [role, setRole] = useState('user');

	const [loading, setLoading] = useState(false); // Loading indicator while request is in progress

	// UI state: any error message from validation or server
	const [error, setError] = useState('');

	// Reset form inputs and error state to defaults
	const resetForm = () => {
		setFirstName('');
		setLastName('');
		setEmail('');
		setPassword('');
		setRole('user');
		setError('');
	};

	// Close modal and clear inputs
	const handleClose = () => {
		resetForm();
		onClose();
	};

	// Basic email format check
	const validateEmail = (email) => { const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; return re.test(email); };

	const handleSubmit = async () => {
		// Clear previous error
		setError('');

		// Frontend Validation
		if (!firstName.trim()) { setError(t('createUser.firstNameRequired')); return; } // FirstName is empty
		if (!lastName.trim()) { setError(t('createUser.lastNameRequired')); return; } // LastName is empty

		
		if (!email.trim()) { setError(t('createUser.emailRequired')); return; } // Email is empty
		if (!validateEmail(email)) { setError(t('createUser.invalidEmail')); return; } // Invalid email format


		if (!password) { setError(t('createUser.passwordRequired')); return; } // Password is empty
		if (password.length < 6) { setError(t('createUser.passwordLength')); return; } // Password too short

		// Require at least one digit or special character
		const hasDigitOrSymbol = /[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>\/\?]/.test(password);
		if (!hasDigitOrSymbol) { setError(t('createUser.passwordRequirements')); return; } // Password lacks digit/symbol

		
		setLoading(true);// Indicate that we are sending request

		try {
			// Prepare payload for server
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
				setError(data.error || 'Failed to create user');
				setLoading(false);
			}
		} catch (err) {
			// Network or unexpected error
			setError('Network error');
			setLoading(false);
		}
	};

	if (!isOpen) return null;

	return (
		<div className="modal-overlay">
			<div className="modal-content">
				<div className="modal-title">{t('createUser.title')}</div>

				{error && <div className="error-msg">{error}</div>}

				<div className="form-group">
					<label>{t('createUser.firstNameLabel')}</label>
					<input
						type="text"
						placeholder={t('createUser.firstNamePlaceholder')}
						value={firstName}
						onChange={(e) => setFirstName(e.target.value)}
						disabled={loading}
						maxLength={50}
					/>
				</div>

				<div className="form-group">
					<label>{t('createUser.lastNameLabel')}</label>
					<input
						type="text"
						placeholder={t('createUser.lastNamePlaceholder')}
						value={lastName}
						onChange={(e) => setLastName(e.target.value)}
						disabled={loading}
						maxLength={50}
					/>
				</div>

				<div className="form-group">
					<label>{t('createUser.emailLabel')}</label>
					<input
						type="email"
						placeholder={t('createUser.emailPlaceholder')}
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						disabled={loading}
					/>
				</div>

				<div className="form-group">
					<label>{t('createUser.roleLabel')}</label>
					<select
						value={role}
						onChange={(e) => setRole(e.target.value)}
						disabled={loading}
					>
						<option value="user">{t('createUser.roleUser')}</option>
						<option value="admin">{t('createUser.roleAdmin')}</option>
					</select>
				</div>

				<div className="form-group">
					<label>{t('createUser.passwordLabel')}</label>
					<input
						type="password"
						placeholder={t('createUser.passwordPlaceholder')}
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						disabled={loading}
						maxLength={50}
					/>
				</div>

				<div className="modal-actions">
					<button className="btn-cancel" onClick={handleClose} disabled={loading}>
						{t('createUser.cancel')}
					</button>
					<button className="btn-confirm" onClick={handleSubmit} disabled={loading}>
						{loading ? t('createUser.creating') : t('createUser.create')}
					</button>
				</div>
			</div>
		</div>
	);
}
