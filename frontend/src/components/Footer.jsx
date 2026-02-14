import React from 'react';
import './Footer.css';

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div className="footer-contact">
          <a href="mailto:bemnetismyname@gmail.com" className="footer-link" aria-label="Email">bemnetismyname@gmail.com</a>
          <span className="sep">•</span>
          <h1></h1>
          <a href="tel:0995012436" className="footer-link" aria-label="Call">0995012436</a>
        </div>
        <div className="footer-copy">&copy; {new Date().getFullYear()} Negadras Market</div>
      </div>
    </footer>
  );
}
