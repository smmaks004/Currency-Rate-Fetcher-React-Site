import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Header from '../Header';
import CurrencyRatesTable from './CurrencyRatesTable';
import CreateCurrency from './subsections/CreateCurrency';
// import ExportTable from './subsections/ExportTable';
import { useAuth } from '../AuthContext';

export default function CurrencyManagement() {
  // Which tab is visible: table of rates, create currency form, or export
  const [activeTab, setActiveTab] = useState('table'); // 'table' | 'create' | 'export'
  
  // Current user + admin check
  const { user } = useAuth();
  const isAdmin = !!(user && ((user.Role).toString().toLowerCase() === 'admin'));
  
  const { t } = useTranslation();

  return (
    <div className="home-container">
      <Header />

      <main className="main-card wide">
        <section
          className="controls"
          style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 0' }}
        >
          <div className="headline" /*style={{ marginRight: '32px' }}*/>{t('currencyManagement.title')}</div>
          <div className="tabs-row" style={{ display: 'flex', gap: '8px', marginTop: 0 }}>
            <button
              className={`tab-btn ${activeTab === 'table' ? 'active' : ''}`}
              onClick={() => setActiveTab('table')}
              style={{ padding: '6px 8px' }}
            >
              {t('currencyManagement.tabTable')}
            </button>
            {isAdmin && (
              <button
                className={`tab-btn ${activeTab === 'create' ? 'active' : ''}`}
                onClick={() => setActiveTab('create')}
                style={{ padding: '6px 8px' }}
              >
                {t('currencyManagement.tabCreate')}
              </button>
            )}
            {/* <button
              className={`tab-btn ${activeTab === 'export' ? 'active' : ''}`}
              onClick={() => setActiveTab('export')}
              style={{ padding: '6px 8px' }}
            >
              Export
              
            </button> */}
          </div>
        </section>

        <section style={{ padding: '16px' }}>
          {activeTab === 'table' && (
            <div>
              <CurrencyRatesTable />
            </div>
          )}

          {/* {user && (
          <div className="nav-tab">
            <Link to="/currencies_management" className="btn-link" style={{ color: '#cbd5e1', textDecoration: 'none' }}>
              Currency management
            </Link>
          </div>
          )} */}
          {isAdmin && activeTab === 'create' && (
            <div>
              <CreateCurrency />
            </div>
          )}

          {/* {activeTab === 'export' && (
            <div>
              <h4>Exports</h4>
              <ExportTable />
            </div>
          )} */}
        </section>
      </main>
    </div>
  );
}
