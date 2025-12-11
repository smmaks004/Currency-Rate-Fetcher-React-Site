import React, { useState } from 'react';
import Header from '../Header';
import { useAuth } from '../AuthContext';
import MarginTable from './MarginTable';
import './MarginManagement.css';

// Simple scaffold mirroring the CurrencyManagement layout, but for margin workflows.
export default function MarginManagement() {
	const [activeTab, setActiveTab] = useState('table'); // 'table' | 'chart'
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
					<div className="headline">Margin Management</div>
					<div className="tabs-row" style={{ display: 'flex', gap: '8px', marginTop: 0 }}>
						<button
							className={`tab-btn ${activeTab === 'table' ? 'active' : ''}`}
							onClick={() => setActiveTab('table')}
							style={{ padding: '6px 8px' }}
						>
							Margin table
						</button>
						<button
								className={`tab-btn ${activeTab === 'chart' ? 'active' : ''}`}
								onClick={() => setActiveTab('chart')}
								style={{ padding: '6px 8px' }}
							>
								Margin Chart
							</button>
						{/*
						<button
							className={`tab-btn ${activeTab === 'export' ? 'active' : ''}`}
							onClick={() => setActiveTab('export')}
							style={{ padding: '6px 8px' }}
						>
							Export
						</button>
						*/}
					</div>
				</section>

				<section style={{ padding: '16px', display: 'grid', gap: '16px' }}>
					{activeTab === 'table' && <MarginTable />}

					{activeTab === 'chart' && (
						<div className="section-block" style={{ display: 'grid', gap: '12px' }}>
							<div>
								<h3 style={{ marginBottom: '4px' }}>Create or edit margin</h3>
								<p style={{ margin: 0 }}>
									Add fields here for margin name, percentage, currency scope, and validity period.
								</p>
							</div>
							<div>
								<h3 style={{ marginBottom: '4px' }}>Approval steps</h3>
								<p style={{ margin: 0 }}>
									Outline review/approval steps before a margin goes live.
								</p>
							</div>
							<div>
								<h3 style={{ marginBottom: '4px' }}>Preview and apply</h3>
								<p style={{ margin: 0 }}>
									Placeholder for a preview of affected rates and a confirmation action.
								</p>
							</div>
						</div>
					)}

					{/*
					{activeTab === 'export' && (
						<div>
							<h4>Exports</h4>
							<p>Export margin configurations or audit logs.</p>
						</div>
					)}
					*/}
				</section>
			</main>
		</div>
	);
}
