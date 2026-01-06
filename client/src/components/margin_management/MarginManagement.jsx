import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Header from '../Header';
import { useAuth } from '../AuthContext';
import MarginTable from './MarginTable';
import MarginChart from './subsections/MarginChart';

// Simple scaffold mirroring the CurrencyManagement layout, but for margin workflows.
export default function MarginManagement() {
	const { t } = useTranslation();
	const [activeTab, setActiveTab] = useState('table'); // 'table' | 'chart'
	const [isModalOpen, setIsModalOpen] = useState(false);
	const [refreshKey, setRefreshKey] = useState(0);
	const { user } = useAuth();
	const isAdmin = !!(user && ((user.Role).toString().toLowerCase() === 'admin'));

	return (
		<div className="home-container">
			<Header />

			<main className="main-card wide">
				<section
					className="controls"
					style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 0' }}
				>
					<div className="headline">{t('marginManagement.title')}</div>
					<div className="tabs-row" style={{ display: 'flex', gap: '8px', marginTop: 0 }}>
						{/* Margin Table */}
						<button
							className={`tab-btn ${activeTab === 'table' ? 'active' : ''}`}
							onClick={() => setActiveTab('table')}
							style={{ padding: '6px 8px' }}
						>
							{t('marginManagement.tabTable')}
						</button>

						{/* Margin Chart */}
						<button
							className={`tab-btn ${activeTab === 'chart' ? 'active' : ''}`}
							onClick={() => setActiveTab('chart')}
							style={{ padding: '6px 8px' }}
						>
							{t('marginManagement.tabChart')}
						</button>
					</div>
				</section>

				<section style={{ padding: '16px', display: 'grid', gap: '16px' }}>
					{activeTab === 'table' && (
						<div>
							<MarginTable key={refreshKey} />
						</div>
					)}

					{activeTab === 'chart' && (
						<div>
							<MarginChart />
						</div>
					)}

				</section>
			</main>

			{/* <CreateMargin
				isOpen={isModalOpen}
				onClose={() => setIsModalOpen(false)}
				onSuccess={() => {
					setRefreshKey(prev => prev + 1); // Refresh the table
				}}
			/> */}
		</div>
	);
}
