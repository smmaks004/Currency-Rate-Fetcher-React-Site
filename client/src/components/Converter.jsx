import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import './Converter.css';
import DatePicker, { registerLocale } from 'react-datepicker';
import enGB from 'date-fns/locale/en-GB';
import 'react-datepicker/dist/react-datepicker.css';
import { calculateSellRate } from '../utils/currencyCalculations';
registerLocale('en-GB', enGB);

// =======================================================================
// Helpers
// =======================================================================
function pad(n) { return String(n).padStart(2, '0'); }
function dateKeyFromDate(d) { return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }

function roundToDecimal(num, decimals) {
    const factor = Math.pow(10, decimals);
    return Math.round(num * factor) / factor;
}

// Round down (used when calculating how much user RECEIVES)
function roundDownToDecimal(num, decimals) {
    const factor = Math.pow(10, decimals);
    if (Number.isNaN(num) || !isFinite(num)) return num;
    return Math.floor(num * factor) / factor;
}

// Round up (used when calculating how much user must PAY/SELL)
function roundUpToDecimal(num, decimals) {
    const factor = Math.pow(10, decimals);
    if (Number.isNaN(num) || !isFinite(num)) return num;
    return Math.ceil(num * factor) / factor;
}

// =======================================================================
// Converter component
// =======================================================================
export default function ConverterPage() {
    const { t } = useTranslation();
    // --- State ---
    const [currencies, setCurrencies] = useState([]);
    const [fromId, setFromId] = useState(null);
    const [toId, setToId] = useState(null);


    const [date, setDate] = useState(() => {
        const d = new Date(); 

        if(d.getDay() === 0){ // Sunday
            d.setDate(d.getDate() - 2); 
        } else if(d.getDay() === 6){ // Saturday
            d.setDate(d.getDate() - 1); 
        }

        d.setHours(0,0,0,0); 
        return d;
    });

    // activeInput determines which field is the source ('from' or 'to')
    const [activeInput, setActiveInput] = useState('from'); 
    const [amount, setAmount] = useState(100); // Numeric value of the active field
    const [amountStr, setAmountStr] = useState(String(100)); // raw string to allow ',' as decimal separator
    
    // In result we now store both values for display
    const [result, setResult] = useState({ valFrom: 100, valTo: 0, usedRate: 1, usedDate: null }); 
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const cacheRef = useRef({});

    // --- Load currencies ---
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch('/api/currencies');
                if (!res.ok) throw new Error('Failed to load currencies');
                const d = await res.json();
                if (cancelled) return;
                setCurrencies(d);
                if (d.length > 0) {
                    setFromId(id => id || d[0].Id);
                    setToId(id => id || (d[1] ? d[1].Id : d[0].Id));
                }
            } catch (e) {
                setError(t('converter.errorLoadCurrencies'));
            }
        })();
        return () => { cancelled = true; };
    }, [t]);

    // --- API and calculations ---
    const fetchRates = useCallback(async (currencyId) => {
        if (!currencyId) return new Map();
        if (cacheRef.current[currencyId]?.loaded) return cacheRef.current[currencyId].map;
        cacheRef.current[currencyId] = { loaded: false, map: new Map() };
        try {
            const res = await fetch(`/api/rates/${currencyId}`);
            if (!res.ok) return new Map();
            const rows = await res.json();
            const map = new Map();
            for (const r of rows) {
                const dt = new Date(r.Date);
                if (Number.isNaN(dt.getTime())) continue;
                const key = dateKeyFromDate(dt);
                map.set(key, { rate: Number(r.ExchangeRate), margin: r.MarginValue != null ? Number(r.MarginValue) : 0 });
            }
            cacheRef.current[currencyId] = { loaded: true, map };
            return map;
        } catch (e) {
            cacheRef.current[currencyId] = { loaded: true, map: new Map() };
            return new Map();
        }
    }, []);

    const getRateForDate = useCallback(async (currencyId, dateKey) => {
        if (!currencyId) return null;
        const map = await fetchRates(currencyId);
        if (!map || map.size === 0) return null;
        if (map.has(dateKey)) return { rate: map.get(dateKey), usedKey: dateKey };
        const keys = Array.from(map.keys()).sort();
        for (let i = keys.length - 1; i >= 0; i--) {
            if (keys[i] <= dateKey) return { rate: map.get(keys[i]), usedKey: keys[i] };
        }
        return null;
    }, [fetchRates]);

    const computePairRates = useCallback(async (fId, tId, dateObj) => {
        if (!fId || !tId || !dateObj) return { sell: null, usedDate: null };
        const key = dateKeyFromDate(dateObj);
        const fCur = currencies.find(c => c.Id === fId);
        const tCur = currencies.find(c => c.Id === tId);
        const isFromEUR = (fCur?.CurrencyCode || '').toUpperCase() === 'EUR';
        const isToEUR = (tCur?.CurrencyCode || '').toUpperCase() === 'EUR';

        const rTo = isToEUR ? { rate: { rate: 1, margin: 0 }, usedKey: key } : await getRateForDate(tId, key);
        const rFrom = isFromEUR ? { rate: { rate: 1, margin: 0 }, usedKey: key } : await getRateForDate(fId, key);

        if (!rTo || !rFrom) return { sell: null, usedDate: null };

        const baseTo = rTo.rate.rate; const baseFrom = rFrom.rate.rate;
        const marginTo = rTo.rate.margin || 0; const marginFrom = rFrom.rate.margin || 0;

        // Calculate sell rate using utility function now
        const sell = calculateSellRate(baseTo, baseFrom, marginTo, marginFrom);

        let usedDate = null;
        if (rTo.usedKey === rFrom.usedKey) usedDate = rTo.usedKey;
        else usedDate = `From: ${rFrom.usedKey}, To: ${rTo.usedKey}`;

        return { sell: Number(sell), usedDate };
    }, [currencies, getRateForDate]);

    // --- Main conversion logic ---
    const computeConversion = useCallback(async () => {
        setError('');
        if (!fromId || !toId || !date) return;
        
        if (fromId === toId) { 
            setResult({ valFrom: amount, valTo: amount, usedRate: 1, usedDate: null });
            return; 
        }

        setLoading(true);
        try {
            // We only care about SELL rate now
            const { sell, usedDate } = await computePairRates(fromId, toId, date);
            if (sell == null) { setError(t('converter.errorNoRate')); setLoading(false); return; }

            let calculatedValFrom, calculatedValTo;
            
                    // If the user edits the top field (Sell Amount) -> compute the bottom (Get Amount)
            if (activeInput === 'from') {
                calculatedValFrom = amount;
                        // Multiply by rate and round DOWN (bank gives less)
                        calculatedValTo = roundDownToDecimal(amount * sell, 2);
            } 
                // If the user edits the bottom field (Get Amount) -> compute the top (Sell Amount)
            else {
                calculatedValTo = amount;
                        // Divide by rate and round UP (must sell slightly more to cover the amount)
                        calculatedValFrom = roundUpToDecimal(amount / sell, 2);
            }

            setResult({
                valFrom: calculatedValFrom,
                valTo: calculatedValTo,
                usedRate: sell,
                usedDate
            });
            
        } catch (e) {
            setError(t('converter.errorCalc'));
        } finally {
            setLoading(false);
        }
    }, [fromId, toId, date, amount, activeInput, computePairRates, t]);

    useEffect(() => {
        const timer = setTimeout(() => computeConversion(), 150);
        return () => clearTimeout(timer);
    }, [fromId, toId, date, amount, activeInput, computeConversion]);

    const swap = () => {
        const newFrom = toId;
        const newTo = fromId;
        setFromId(newFrom);
        setToId(newTo);
        // On swap we simply recalculate the current activeInput
    };

    const fromCode = currencies.find(c => c.Id === fromId)?.CurrencyCode || '—';
    const toCode = currencies.find(c => c.Id === toId)?.CurrencyCode || '—';

    // Input handlers
    const handleFromChange = (e) => {
        const raw = e.target.value;
        const normalized = raw.replace(',', '.');
        const val = normalized === '' ? 0 : Number(normalized);
        setAmount(val);
        setAmountStr(raw);
        setActiveInput('from');
    };

    const handleToChange = (e) => {
        const raw = e.target.value;
        const normalized = raw.replace(',', '.');
        const val = normalized === '' ? 0 : Number(normalized);
        setAmount(val);
        setAmountStr(raw);
        setActiveInput('to');
    };

    return (
        <div className="converter-card">
            {/* Header */}
            <div className="conv-header">
                <h3>{t('converter.title')}</h3>
            </div>

            <div className="conv-body">
                <div className="converter-row">

                {/* TOP INPUT (Source / Sell) */}
                <div className="conv-col">
                    <label className="conv-label conv-label-selling">
                        {t('converter.selling', { code: fromCode })}
                    </label>
                    <input
                        className={`conv-input ${activeInput === 'from' ? 'main-field-active' : ''}`}
                        type="text"
                        inputMode="decimal"
                        pattern="[0-9]*[.,]?[0-9]*"
                        // If this is the active field - show amount (what the user types)
                        // Otherwise - show the calculated value from result
                        value={activeInput === 'from' ? amountStr : String(result.valFrom ?? '')}
                        onChange={handleFromChange}
                    />
                </div>

                <div className="conv-col">
                    <label>{t('converter.currency')}</label>
                    <select className="conv-select" value={fromId||''} onChange={(e)=>setFromId(Number(e.target.value))}>
                        {currencies.map(c=> <option key={c.Id} value={c.Id}>{c.CurrencyCode}</option>)}
                    </select>
                </div>
                
                <div className="conv-swap">
                    <button className="conv-select conv-small-btn" onClick={swap} title={t('converter.swap')}>《 》</button>
                </div>

                {/* BOTTOM INPUT (Target / Get) */}
                <div className="conv-col">
                    <label className="conv-label">
                        {t('converter.willGet', { code: toCode })}
                    </label>
                    <input
                        className={`conv-input ${activeInput === 'to' ? 'main-field-active' : ''}`}
                        type="text"
                        inputMode="decimal"
                        pattern="[0-9]*[.,]?[0-9]*"
                        // Now this field is also editable
                        value={activeInput === 'to' ? amountStr : String(result.valTo ?? '')}
                        onChange={handleToChange}
                    />
                </div>

                <div className="conv-col">
                    <label>{t('converter.currency')}</label>
                    <select className="conv-select" value={toId||''} onChange={(e)=>setToId(Number(e.target.value))}>
                        {currencies.map(c=> <option key={c.Id+'-to'} value={c.Id}>{c.CurrencyCode}</option>)}
                    </select>
                </div>
                </div>

                {/* DATE & STATUS */}
                <div className="converter-row conv-row-between">
                    <div className="conv-date-wrap">
                        <label>{t('converter.date')}</label>
                        <DatePicker
                            selected={date}
                            onChange={(d) => { if(d){ d.setHours(0,0,0,0); setDate(d); }}}
                            dateFormat="yyyy-MM-dd"
                            locale="en-GB"
                            // Prevent picking weekends and any future date (greater than today)
                            maxDate={new Date()}
                            filterDate={(d) => {
                                const day = d.getDay();
                                const today = new Date();
                                const takenDate = new Date(d);

                                takenDate.setHours(0,0,0,0);
                                today.setHours(0,0,0,0);
                                return day !== 0 && day !== 6 && takenDate <= today; 
                            }}
                            className="date-picker-input"
                        />
                    </div>
                    <div>
                        {loading && <span className="conv-loading">{t('converter.loading')}</span>}
                    </div>
                 </div>

                {/* RESULT INFO */}
                <div className="conv-result conv-result-block">
                    {error && <div className="conv-error">{error}</div>}

                    {!error && result && (
                        <div className="conv-result-center">
                            <div className="conv-result-title">
                                <span>
                                    {t('converter.result', { fromVal: result.valFrom, fromCode, toVal: result.valTo, toCode })}
                                </span>
                            </div>

                            <div className="conv-result-rate">
                                {t('converter.rateApplied', { fromCode, rate: result.usedRate?.toFixed(6), toCode })}
                            </div>
                            {result.usedDate && (
                                <div className="conv-result-date">
                                    {t('converter.ratesTaken', { date: result.usedDate })}
                                </div>
                            )}
                        </div>
                    )}
                </div>

            </div>

            
        </div>
    );
}