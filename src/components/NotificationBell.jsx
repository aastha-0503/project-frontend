import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { FiBell, FiX, FiFileText, FiUsers, FiTarget, FiAward, FiPhone } from 'react-icons/fi';
import { API_BASE, getActiveJobId, relativeTime } from '../lib/enterprise.js';

const ICON_FOR = {
  jd:         <FiFileText />,
  resumes:    <FiUsers />,
  screening:  <FiTarget />,
  submission: <FiAward />,
  interview:  <FiPhone />,
};

const SEEN_KEY = 'geeky_ai_notif_seen';

const NotificationBell = () => {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [lastSeen, setLastSeen] = useState(() => {
    try { return localStorage.getItem(SEEN_KEY) || ''; } catch { return ''; }
  });
  const panelRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/activity/${getActiveJobId()}?limit=20`);
      setItems(res.data.activity || []);
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const unread = items.filter(i => !lastSeen || i.id > lastSeen).length;

  const togglePanel = () => {
    setOpen(o => {
      if (!o && items.length > 0) {
        const newest = items[0].id;
        setLastSeen(newest);
        try { localStorage.setItem(SEEN_KEY, newest); } catch {}
      }
      return !o;
    });
  };

  return (
    <div className="notif-wrap" ref={panelRef}>
      <button className="notif-btn" onClick={togglePanel} title="Activity feed" aria-label="Notifications">
        <FiBell />
        {unread > 0 && <span className="notif-dot" />}
      </button>

      {open && (
        <div className="notif-panel">
          <div className="notif-header">
            <h3>Activity</h3>
            <button className="icon-btn" onClick={() => setOpen(false)}>
              <FiX />
            </button>
          </div>
          <div className="notif-list">
            {items.length === 0 ? (
              <div style={{ padding: '32px 18px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                No activity yet. Uploads, screenings, and assessment submissions will show up here.
              </div>
            ) : items.map(item => (
              <div key={item.id} className="notif-item">
                <div className="notif-icon">{ICON_FOR[item.kind] || <FiBell />}</div>
                <div className="notif-content">
                  <div className="notif-title">{item.message}</div>
                  <div className="notif-time">{relativeTime(item.at)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
