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
			setCreateError(t('createUser.firstNameRequired'));
			return;
		}

		if (!lastName.trim()) {
			setCreateError(t('createUser.lastNameRequired'));
			return;
		}

		if (!email.trim()) {
			setCreateError(t('createUser.emailRequired'));
			return;
		}

		if (!validateEmail(email)) {
			setCreateError(t('createUser.invalidEmail'));
			return;
		}

		if (!password) {
			setCreateError(t('createUser.passwordRequired'));
			return;
		}

		if (password.length < 6) {
			setCreateError(t('createUser.passwordLength'));
			return;
		}

		// Require at least one digit or special character
		const hasDigitOrSymbol = /[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>\/\?]/.test(password);
		if (!hasDigitOrSymbol) {
			setCreateError(t('createUser.passwordRequirements'));
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
				<div className="modal-title">{t('createUser.title')}</div>

				{createError && <div className="error-msg">{createError}</div>}

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
