import React, { useState } from 'react';
import Header from '../Header';
import { useAuth } from '../AuthContext';

// Simple scaffold mirroring the CurrencyManagement layout, but for margin workflows.
export default function MarginManagement() {
	const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'configure'
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
							className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
							onClick={() => setActiveTab('overview')}
							style={{ padding: '6px 8px' }}
						>
							Margin overview
						</button>
						{isAdmin && (
							<button
								className={`tab-btn ${activeTab === 'configure' ? 'active' : ''}`}
								onClick={() => setActiveTab('configure')}
								style={{ padding: '6px 8px' }}
							>
								Configure margins
							</button>
						)}
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
					{activeTab === 'overview' && (
						<div className="section-block" style={{ display: 'grid', gap: '12px' }}>
							<div>
								<h3 style={{ marginBottom: '4px' }}>Current margins</h3>
								<p style={{ margin: 0 }}>
									Placeholder area for listing existing margin configurations and their effective dates.
								</p>
							</div>
							<div>
								<h3 style={{ marginBottom: '4px' }}>Rules and conditions</h3>
								<p style={{ margin: 0 }}>
									Use this section to outline how margins are applied (by currency, product type, or channel).
								</p>
							</div>
							<div>
								<h3 style={{ marginBottom: '4px' }}>Recent updates</h3>
								<p style={{ margin: 0 }}>
									Space to show the latest margin changes and who applied them.
								</p>
							</div>
						</div>
					)}

					{isAdmin && activeTab === 'configure' && (
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
