import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

export default function Currencies() {
  const [currencies, setCurrencies] = useState([]);
  const { t } = useTranslation();

useEffect(() => {
  fetch('/api/currencies')
    .then(res => res.json())
    .then(data => {
      console.log('Currencies:', data); // check which fields are actually present
      setCurrencies(data);
    })
    .catch(console.error);
}, []);


  return (
    <div>
  <h2>{t('currenciesList.title')}</h2>
      <ul>
        {currencies.map(c => (
          <li key={c.Id}>{c.Id} == {c.CurrencyCode}</li>
        ))}
      </ul>
    </div>
  );
}
