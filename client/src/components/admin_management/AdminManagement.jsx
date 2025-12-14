import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../AuthContext';
import '../common/TableStyles.css';

import Header from '../Header';
import UserTable from './UserTable';
import './AdminManagement.css';

export default function AdminManagement() {
	const { t } = useTranslation();
	const [activeTab, setActiveTab] = useState('userTable');
	const { user } = useAuth();
	const isAdmin = !!(user && ((user.Role).toString().toLowerCase() === 'admin'));

	if (!isAdmin) {
		return (
			<div className="home-container">
				<Header />
				<main className="main-card wide">
					<section className="controls" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 0' }}>
						<div className="headline">Admin Management</div>
					</section>
					<section style={{ padding: '16px' }}>
						<div className="no-data-cell">Access restricted to administrators.</div>
					</section>
				</main>
			</div>
		);
	}

	return (
		<div className="home-container">
			<Header />

			<main className="main-card wide">
				<section
					className="controls"
					style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 0' }}
				>
					<div className="headline">Admin Management</div>
					<div className="tabs-row" style={{ display: 'flex', gap: '8px', marginTop: 0 }}>
						<button
							className={`tab-btn ${activeTab === 'userTable' ? 'active' : ''}`}
							onClick={() => setActiveTab('userTable')}
							style={{ padding: '6px 8px' }}
						>
							User Table
						</button>
					</div>
				</section>

				<section style={{ padding: '16px', display: 'grid', gap: '16px' }}>
					{activeTab === 'userTable' && (
						<div>
							<UserTable />
						</div>
					)}
				</section>
			</main>
		</div>
	);
}
