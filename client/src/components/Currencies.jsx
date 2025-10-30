import React, { useEffect, useState } from 'react';

export default function Currencies() {
  const [currencies, setCurrencies] = useState([]);

useEffect(() => {
  fetch('http://localhost:4000/api/currencies')
    .then(res => res.json())
    .then(data => {
      console.log('Currencies:', data); // check which fields are actually present
      setCurrencies(data);
    })
    .catch(console.error);
}, []);


  return (
    <div>
  <h2>List of Ids from the Currencies table</h2>
      <ul>
        {currencies.map(c => (
          <li key={c.Id}>{c.Id} == {c.CurrencyCode}</li>
        ))}
      </ul>
    </div>
  );
}
