/*
 * JUST TEST PAGE 
 */

import React from 'react';

export default function AdminPage() {
  return (
    <div style={{ padding: 20 }}>
      <h2>Admin Area</h2>
      <p>This is a protected admin page. Only users with role <strong>Admin</strong> can see this.</p>
    </div>
  );
}
