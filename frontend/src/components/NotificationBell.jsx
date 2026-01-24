import React, { useEffect, useRef, useState } from 'react';
import styles from './Navbar.module.css';

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);

  const fetchNotes = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/notifications', { credentials: 'include' });
      if (!res.ok) return setNotes([]);
      const data = await res.json();
      setNotes(data || []);
    } catch (e) {
      setNotes([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // initial fetch
    fetchNotes();
  }, []);

  useEffect(() => {
    // close on outside click
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, []);

  const unreadCount = notes.filter(n => !n.isRead).length;

  const markRead = async (id) => {
    try {
      const res = await fetch(`/api/notifications/${id}/read`, { method: 'PATCH', credentials: 'include' });
      if (!res.ok) return;
      const json = await res.json();
      setNotes((prev) => prev.map(p => (String(p._id || p.id) === String(id) ? json.notification : p)));
    } catch (e) {
      // ignore
    }
  };

  return (
    <div className={styles.notificationBell} ref={ref} style={{ position: 'relative' }}>
      <button
        aria-label="Notifications"
        className={styles.iconButton}
        onClick={(e) => { e.stopPropagation(); setOpen(v => { const next = !v; if (next) fetchNotes(); return next; }); }}
      >
        <span style={{ fontSize: '1.35rem' }}>🔔</span>
        {unreadCount > 0 && <span className={styles.badge}>{unreadCount}</span>}
      </button>

      {open && (
        <div className={styles.dropdown} role="menu">
          <div className={styles.dropdownHeader}>Notifications</div>
          {loading && <div className={styles.dropdownEmpty}>Loading…</div>}
          {!loading && notes.length === 0 && <div className={styles.dropdownEmpty}>No notifications</div>}
          {!loading && notes.map((n) => (
            <div key={n._id || n.id} className={n.isRead ? styles.notifRead : styles.notifItem}>
              <div style={{ flex: 1 }}>
                <div className={styles.notifMessage}>{n.message || n.type}</div>
                <div className={styles.notifTime}>{n.createdAt ? new Date(n.createdAt).toLocaleString() : ''}</div>
              </div>
              {!n.isRead && (
                <button className={styles.markReadButton} onClick={() => markRead(n._id || n.id)}>Mark</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
