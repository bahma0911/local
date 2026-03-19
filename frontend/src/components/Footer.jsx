import React from 'react';
import './Footer.css';

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div className="footer-contact">
          <a href="mailto:bemnetismyname19@gmail.com" className="footer-link footer-email" aria-label="Email">📧 bemnetismyname19@gmail.com</a>
          <a href="tel:0995012436" className="footer-link footer-phone" aria-label="Call">📞 0995012436</a>
        </div>
        <div className="footer-copy">&copy; {new Date().getFullYear()} ሰኞ ገበያ</div>
      </div>
    </footer>
  );
}
