import React from 'react';

// Google login removed in public-only mode. Keep a stub component to avoid import errors.
export default function GoogleLoginButton() {
  return (
    <div style={{ padding: 8 }}>
      <button disabled style={{ opacity: 0.6 }}>Google login disabled</button>
    </div>
  );
}
