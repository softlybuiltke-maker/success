import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
    import { createPortal } from 'react-dom';
    import {
      ShoppingBag, TrendingUp, TrendingDown, Users, ArrowRight, CheckCircle,
      Package, DollarSign, PieChart, Settings as SettingsIcon, LogOut, Calculator as CalcIcon,
      Phone, ShieldCheck, Plus, Scan, Trash2, Edit2, PackagePlus, Check, X,
      FileText, ClipboardList, Lock, Eye, EyeOff, Volume2, Upload, Download, Music,
      Search, AlertTriangle, MessageCircle, AlertCircle, QrCode, Zap, Copy,
      Loader2, Delete, Clock, Key, Tag, Printer, UserPlus, ShoppingCart, Percent, Tag as TagIcon, Save,
      Truck, Bell, Send, Play, Calendar, Menu, RefreshCw
    } from 'lucide-react';
    import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
    import toast, { Toaster } from 'react-hot-toast';
    import { jsPDF } from 'jspdf';
    import autoTable from 'jspdf-autotable';
    import { Html5Qrcode, Html5QrcodeScanner, Html5QrcodeSupportedFormats, Html5QrcodeScannerState } from 'html5-qrcode';
    import QRCode from 'qrcode';
    import CryptoJS from 'crypto-js';
    import { AuthScreen } from './AuthScreen';
    
    window.LOGO_DATA = '/logo.png';

    // --- CLOUD REGISTRY UTILS ---
    const CLOUD_KV_API = "https://keyvalue.immanuel.co/api/KeyVal";
    const APP_NAMESPACE = "SoftlyPOS_Cloud_Registry";

    const uploadToCloudRegistry = async (storeHandle, masterPassword, payloadObj) => {
      try {
        const payloadStr = JSON.stringify(payloadObj);
        const ciphertext = CryptoJS.AES.encrypt(payloadStr, masterPassword).toString();
        const hexCiphertext = CryptoJS.enc.Hex.stringify(CryptoJS.enc.Utf8.parse(ciphertext));
        const chunks = hexCiphertext.match(/.{1,100}/g) || [];
        
        const countRes = await fetch(`${CLOUD_KV_API}/UpdateValue/${APP_NAMESPACE}/${encodeURIComponent(storeHandle)}_count/${chunks.length}`, {
          method: 'POST'
        });
        if (!countRes.ok) throw new Error('Failed to upload count');

        for (let i = 0; i < chunks.length; i++) {
          const res = await fetch(`${CLOUD_KV_API}/UpdateValue/${APP_NAMESPACE}/${encodeURIComponent(storeHandle)}_${i}/${chunks[i]}`, {
            method: 'POST'
          });
          if (!res.ok) throw new Error(`Failed to upload chunk ${i}`);
        }
        return true;
      } catch (err) {
        console.error(err);
        return false;
      }
    };

    const downloadFromCloudRegistry = async (storeHandle, masterPassword) => {
      try {
        const countRes = await fetch(`${CLOUD_KV_API}/GetValue/${APP_NAMESPACE}/${encodeURIComponent(storeHandle)}_count`);
        if (!countRes.ok) throw new Error('Failed to fetch count');
        const countText = await countRes.text();
        if (countText === 'null' || !countText) throw new Error('Store handle not found');
        
        const count = parseInt(countText.replace(/["\s]/g, ''));
        if (isNaN(count) || count <= 0) throw new Error('Invalid chunk count');

        let hexCiphertext = '';
        for (let i = 0; i < count; i++) {
          const res = await fetch(`${CLOUD_KV_API}/GetValue/${APP_NAMESPACE}/${encodeURIComponent(storeHandle)}_${i}`);
          if (!res.ok) throw new Error(`Failed to fetch chunk ${i}`);
          const chunk = await res.text();
          hexCiphertext += chunk.replace(/["\s]/g, '');
        }

        const ciphertext = CryptoJS.enc.Utf8.stringify(CryptoJS.enc.Hex.parse(hexCiphertext));
        const bytes = CryptoJS.AES.decrypt(ciphertext, masterPassword);
        const decryptedStr = bytes.toString(CryptoJS.enc.Utf8);
        if (!decryptedStr) throw new Error('Invalid master password or corrupted data');
        return JSON.parse(decryptedStr);
      } catch (err) {
        console.error(err);
        throw err;
      }
    };

    // --- IndexedDB UTILS ---
    const DB_NAME = 'BirkuShopDB';
    const DB_VERSION = 2;
    const STORE_NAME = 'shopData';
    const PERF_STORE_NAME = 'monthlyPerfData';
    let db;

    const openDB = () => {
      return new Promise((resolve, reject) => {
        if (db) return resolve(db);
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = (event) => reject('Error opening DB');
        request.onsuccess = (event) => {
          db = event.target.result;
          resolve(db);
        };
        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'key' });
          }
          if (!db.objectStoreNames.contains(PERF_STORE_NAME)) {
            db.createObjectStore(PERF_STORE_NAME, { keyPath: 'key' });
          }
        };
      });
    };

    const clearDataFromDB = async () => {
      const db = await openDB();
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      return new Promise((resolve, reject) => {
        store.clear();
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    };

    const saveMonthlySnapshots = async (buckets) => {
      const db = await openDB();
      const transaction = db.transaction([PERF_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(PERF_STORE_NAME);
      return new Promise((resolve, reject) => {
        const request = store.put({ key: 'snapshots', value: buckets });
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    };

    const loadMonthlySnapshots = async () => {
      const db = await openDB();
      const transaction = db.transaction([PERF_STORE_NAME], 'readonly');
      const store = transaction.objectStore(PERF_STORE_NAME);
      return new Promise((resolve, reject) => {
        const request = store.get('snapshots');
        request.onsuccess = () => resolve(request.result ? request.result.value : []);
        request.onerror = () => reject(request.error);
      });
    };

    const clearMonthlySnapshots = async () => {
      const db = await openDB();
      const transaction = db.transaction([PERF_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(PERF_STORE_NAME);
      return new Promise((resolve, reject) => {
        store.clear();
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    };

    const saveDataToDB = async (key, value) => {
      const db = await openDB();
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      return new Promise((resolve, reject) => {
        const request = store.put({ key, value });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    };

    const loadDataFromDB = async (key) => {
      const db = await openDB();
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      return new Promise((resolve, reject) => {
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result ? request.result.value : undefined);
        request.onerror = () => reject(request.error);
      });
    };

    // --- GOOGLE SHEETS SYNC ---
    const syncToGoogleSheets = async (data) => {
      const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyBWad5YuFfLRC8rwmjR56rN_CfHVbhRTSovn4AUyadQimn6ZztgZ--HU55kmk53lIa/exec';
      try {
        await fetch(SCRIPT_URL, {
          method: 'POST',
          mode: 'no-cors',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data)
        });
        toast.success('Synced to Google Sheets');
      } catch (error) {
        console.error('Error syncing to Google Sheets', error);
        toast.error('Sheet Sync Failed');
      }
    };

    // --- TURSO SYNC UTILITIES ---
    // Best-effort, fully silent — never throws or blocks POS operations.
    const tursoSync = async (key, data) => {
      try {
        localStorage.setItem('has_pending_sync', 'true');
        if (!navigator.onLine) return false;

        const r = await fetch('/api/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, value: JSON.stringify(data) }),
        });
        if (r.ok) {
          // Stamp local write time so the polling loop doesn't re-download our own change
          sessionStorage.setItem('sb_last_local_write', String(Date.now()));
          return true;
        }
        return false;
      } catch (_) {
        // Swallow all errors — Turso sync must never crash the POS
        return false;
      }
    };

    // Sync all collections at once (used on initial connect if Turso is empty)
    const tursoSyncAll = async () => {
      try {
        const keys = ['products', 'salesHistory', 'customers', 'debts', 'paidDebts', 'expenses', 'stockHistory', 'settings', 'superAdminSettings'];
        let successCount = 0;
        for (const k of keys) {
          let val = await loadDataFromDB(k);
          if (val === undefined || val === null) {
            // Default empty state for collections if they haven't been created yet
            val = (k === 'settings' || k === 'superAdminSettings') ? {} : [];
          }
          const ok = await tursoSync(k, val);
          if (ok) successCount++;
        }
        if (successCount === keys.length) {
          localStorage.removeItem('has_pending_sync');
        }
      } catch (_) {
        // Silent
      }
    };

    // Pull all data from Turso and overwrite local DB (used when connecting to existing DB)
    const tursoPullAll = async () => {
      try {
        if (localStorage.getItem('has_pending_sync') === 'true') {
          await tursoSyncAll();
        }
        
        const res = await fetch('/api/pull', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        const result = await res.json();
        
        if (result.ok && result.data && Object.keys(result.data).length > 0) {
          // Data found! Save it to local DB
          for (const [key, value] of Object.entries(result.data)) {
            const cleanedValue = Array.isArray(value) ? value.filter(Boolean) : value;
            await saveDataToDB(key, cleanedValue);
          }
          return true; // Indicates we pulled data
        }
        return false; // Turso is empty or failed
      } catch (err) {
        console.error("Turso pull error:", err);
        return false;
      }
    };
    // ─────────────────────────────────────────────────────────────────────────

    // --- CONSTANTS ---
    const PRESET_SOUNDS = [
      { id: 'beep', name: 'Classic Beep', url: 'https://assets.mixkit.co/active_storage/sfx/2574/2574-preview.mp3' },
      { id: 'chime', name: 'Success Chime', url: 'https://assets.mixkit.co/active_storage/sfx/2575/2575-preview.mp3' },
      { id: 'cash', name: 'Cash Register', url: 'https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3' },
      { id: 'blip', name: 'Tech Blip', url: 'https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3' }
    ];

    const DEFAULT_SETTINGS = {
      name: '',
      address: '',
      phone: '',
      extraInfo: '',
      receiptFooter: '',
      receiptTitleFontSize: '12pt',
      receiptBodyFontSize: '10pt',
      receiptShowAddress: true,
      receiptShowPhone: true,
      receiptShowExtraInfo: true,
      receiptShowFooter: true,
      showCosts: true,
      showScan: true,
      showScanToSell: true,
      trackExpiry: true,
      scanSound: null,
      ownerPin: '',
      ownerPassword: '',
      loginMode: 'pin',
      ownerName: '',
      cashiers: [],
      suppliers: [],
      autoResetDay: null,
      autoResetOptions: { salesHistory: false, expenses: false, stockHistory: false },
      lastAutoResetDate: null,
      allowClearMonthlyPerf: false,
      notificationsEnabled: true,
      notifyDebtDays: 5,
      notifyLowStock: 5
    };

    const DEFAULT_SUPER_ADMIN_SETTINGS = { scannerSize: 250, lockPin: '', periodInDays: 0, enablePeriodLock: false, periodStartDate: null };

    // --- HELPER COMPONENTS & UTILS ---

    // Locally-generated QR code (replaces api.qrserver.com — no internet required)
    const QRCodeImage = ({ url, size = 100 }) => {
      const canvasRef = useRef(null);
      useEffect(() => {
        if (canvasRef.current && url) {
          // Use low error correction 'L' so the dense AES string doesn't create a too-dense QR code.
          // Render at high scale natively, then restrict display size via CSS for crispness.
          QRCode.toCanvas(canvasRef.current, url, { scale: 6, margin: 2, errorCorrectionLevel: 'L' }, (err) => {
            if (err) console.error('QR generation error', err);
            // Force the canvas to obey the container size, as toCanvas overwrites inline styles
            if (canvasRef.current) {
              canvasRef.current.style.width = '100%';
              canvasRef.current.style.height = '100%';
            }
          });
        }
      }, [url, size]);
      return (
        <div style={{ textAlign: 'center', marginTop: '10px', marginBottom: '10px' }}>
          <div style={{ width: size, height: size, margin: '0 auto' }}>
            <canvas ref={canvasRef} style={{ display: 'block' }} />
          </div>
          <div style={{ fontSize: '8pt', marginTop: '4px' }}>Scan for more info</div>
        </div>
      );
    };

    const QRScanView = ({ onScanSuccess, onClose }) => {
      const scannerRef = useRef(null);
      const startedRef = useRef(false);
      const divId = 'qr-reader-view';

      useEffect(() => {
        if (startedRef.current) return;
        startedRef.current = true;

        const html5QrCode = new Html5Qrcode(divId);
        scannerRef.current = html5QrCode;

        const config = {
          fps: 15,
          qrbox: { width: 280, height: 280 },
          aspectRatio: 1.0,
        };

        const safeStop = () => {
          try {
            if (scannerRef.current) {
              scannerRef.current.stop().then(() => {
                try { scannerRef.current.clear(); } catch(_) {}
              }).catch(() => {
                try { scannerRef.current.clear(); } catch(_) {}
              });
            }
          } catch(e) {
            try { scannerRef.current?.clear(); } catch(_) {}
          }
        };

        // Always request cameras first. This guarantees the browser permission prompt triggers correctly.
        Html5Qrcode.getCameras().then(cameras => {
          if (!cameras || cameras.length === 0) {
            toast.error('No camera found on this device.');
            onClose();
            return;
          }

          // Prefer the last camera (usually rear on mobile)
          const cameraId = cameras[cameras.length - 1].id;

          html5QrCode.start(
            cameraId,
            config,
            (decodedText) => {
              safeStop();
              onScanSuccess(decodedText);
            },
            () => {} // ignore per-frame decode errors
          ).catch(err => {
            console.warn('Primary camera failed, trying fallback...', err);
            // Fallback to the first available camera
            html5QrCode.start(
              cameras[0].id,
              config,
              (decodedText) => {
                safeStop();
                onScanSuccess(decodedText);
              },
              () => {}
            ).catch(() => {
              toast.error('Could not start camera. Please refresh and try again.');
              onClose();
            });
          });
        }).catch(err => {
          console.error('Camera permission error:', err);
          toast.error('Camera permission denied. Please allow access in your browser settings.');
          onClose();
        });

        return () => {
          try {
            if (scannerRef.current) {
              // Try to safely stop and clear on unmount
              scannerRef.current.stop().then(() => {
                try { scannerRef.current.clear(); } catch(_) {}
              }).catch(() => {
                try { scannerRef.current.clear(); } catch(_) {}
              });
            }
          } catch(e) {
            try { scannerRef.current?.clear(); } catch(_) {}
          }
        };
      }, []);

      return (
        <div style={{ position: 'fixed', inset: 0, background: '#0f172a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          {/* Header */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '20px 16px 16px', background: 'linear-gradient(to bottom, rgba(0,0,0,0.7), transparent)', zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ color: 'white', fontSize: '18px', fontWeight: 700 }}>Scan QR Code</div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '13px', marginTop: 2 }}>Point camera at the cashier QR code</div>
            </div>
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'white', fontSize: 20, backdropFilter: 'blur(4px)' }}>
              ✕
            </button>
          </div>

          {/* Scanner fills the screen */}
          <div id={divId} style={{ width: '100%', maxWidth: '500px' }}></div>

          {/* Hint at the bottom */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '16px', background: 'linear-gradient(to top, rgba(0,0,0,0.7), transparent)', zIndex: 2 }}>
            <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '13px', textAlign: 'center' }}>Hold the camera steady inside the frame</div>
            <button onClick={onClose} style={{ display: 'block', margin: '12px auto 0', background: 'white', color: '#0f172a', border: 'none', borderRadius: 12, padding: '12px 40px', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      );
    };

    const PrintableReceipt = ({ data }) => {
      if (!data) return null;
      const { cart, totals, payment, settings, cashierName, customer } = data;

      const now = new Date();
      const invoiceNumber = `INV-${now.getTime().toString().slice(-6)}`;
      const date = now.toLocaleDateString('en-GB');
      const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
      const hr = <div style={{ borderTop: '1px dashed #000', margin: '5px 0' }}></div>;

      return (
        <div style={{ fontFamily: 'monospace', fontSize: settings.receiptBodyFontSize || '10pt', color: '#000', width: '280px', padding: '5px' }}>
          <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: settings.receiptTitleFontSize || '12pt' }}>{settings.name}</div>
          {settings.receiptShowAddress && <div style={{ textAlign: 'center' }}>{settings.address}</div>}
          {settings.receiptShowPhone && <div style={{ textAlign: 'center' }}>Tel: {settings.phone}</div>}
          <div style={{ height: '10px' }}></div>
          <div>Invoice #: {invoiceNumber}</div>
          <div>Date: {date} {time}</div>
          <div>Served By: {cashierName || 'N/A'}</div>
          {customer && customer.name && <div>Customer: {customer.name}</div>}
          {hr}
          <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 1fr 1fr', fontWeight: 'bold', gap: '4px' }}>
            <span>Item</span>
            <span style={{ textAlign: 'right' }}>Qty</span>
            <span style={{ textAlign: 'right' }}>Price</span>
            <span style={{ textAlign: 'right' }}>Total</span>
          </div>
          {hr}
          {cart.map((item, index) => (
            <div key={index} style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 1fr 1fr', gap: '4px' }}>
              <span>{item.name}</span>
              <span style={{ textAlign: 'right' }}>{item.quantity}</span>
              <span style={{ textAlign: 'right' }}>{(Number() || 0).toFixed(2)}</span>
              <span style={{ textAlign: 'right' }}>{(Number(item.price * item.quantity) || 0).toFixed(2)}</span>
            </div>
          ))}
          {hr}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
            <span>TOTAL:</span>
            <span>{(Number() || 0).toFixed(2)}</span>
          </div>
          {totals.totalDiscount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Discount:</span>
              <span>-{(Number() || 0).toFixed(2)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Subtotal:</span>
            <span>{(Number() || 0).toFixed(2)}</span>
          </div>
          {hr}
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>PAID ({payment.method}):</span>
            <span>{payment.method === 'Cash' ? (Number() || 0).toFixed(2) : (Number() || 0).toFixed(2)}</span>
          </div>
          {payment.method === 'Cash' && payment.change > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
              <span>CHANGE:</span>
              <span>{(Number() || 0).toFixed(2)}</span>
            </div>
          )}
          <div style={{ height: '10px' }}></div>
          {settings.receiptShowExtraInfo && <div style={{ textAlign: 'center' }}>{settings.extraInfo}</div>}
          <div style={{ height: '10px' }}></div>
          {settings.receiptLink && settings.receiptShowQr !== false && (
            <QRCodeImage url={settings.receiptLink} />
          )}
          {settings.receiptShowFooter && <div style={{ textAlign: 'center', fontWeight: 'bold' }}>{settings.receiptFooter}</div>}
        </div>
      );
    };

    const PrintPreviewModal = ({ data, onClose, onPrint }) => {
      const receiptTextRef = useRef(null);

      const generateReceiptText = (data) => {
        if (!data) return '';
        const { cart, totals, payment, settings, cashierName, customer } = data;
        const now = new Date();
        const invoiceNumber = `INV-${now.getTime().toString().slice(-6)}`;
        const date = now.toLocaleDateString('en-GB');
        const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

        const hr = '--------------------------------\n';
        let text = '';

        text += `${settings.name}\n`;
        if (settings.receiptShowAddress) text += `${settings.address}\n`;
        if (settings.receiptShowPhone) text += `Tel: ${settings.phone}\n\n`;

        text += `Invoice #: ${invoiceNumber}\n`;
        text += `Date: ${date} ${time}\n`;
        text += `Served By: ${cashierName || 'N/A'}\n`;
        if (customer && customer.name) text += `Customer: ${customer.name}\n`;
        text += hr;

        cart.forEach(item => {
          text += `${item.name}\n`;
          text += `  ${item.quantity} x ${(Number() || 0).toFixed(2)} = ${(Number(item.price * item.quantity) || 0).toFixed(2)}\n`;
        });

        text += hr;

        text += `Subtotal: ${(Number() || 0).toFixed(2)}\n`;
        if (totals.totalDiscount > 0) {
          text += `Discount: -${(Number() || 0).toFixed(2)}\n`;
        }
        text += `TOTAL: ${(Number() || 0).toFixed(2)}\n`;
        text += hr;

        const paidAmount = payment.method === 'Cash' ? (Number() || 0).toFixed(2) : (Number() || 0).toFixed(2);
        text += `PAID (${payment.method}): ${paidAmount}\n`;
        if (payment.method === 'Cash' && payment.change > 0) {
          text += `CHANGE: ${(Number() || 0).toFixed(2)}\n`;
        }
        text += '\n';
        if (settings.receiptShowExtraInfo) text += `${settings.extraInfo}\n\n`;
        if (settings.receiptLink && settings.receiptShowQr !== false) text += `Link: ${settings.receiptLink}\n\n`;
        if (settings.receiptShowFooter) text += `${settings.receiptFooter}\n`;

        return text;
      };

      const receiptText = useMemo(() => generateReceiptText(data), [data]);

      const copyToClipboard = () => {
        if (receiptTextRef.current) {
          navigator.clipboard.writeText(receiptTextRef.current.innerText)
            .then(() => toast.success('Receipt copied to clipboard!'))
            .catch(() => toast.error('Failed to copy.'));
        }
      };

      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl relative">
            <div className="p-4 border-b flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2"><Printer className="w-5 h-5 text-emerald-600" /> Print Receipt</h3>
              <button onClick={onClose}><X className="w-5 h-5 text-slate-500 hover:text-slate-800" /></button>
            </div>
            <div className="p-6">
              <p className="text-sm text-slate-500 mb-3">Click the text below to copy it, or use the "Print" button for a thermal receipt.</p>
              <pre
                ref={receiptTextRef}
                onClick={copyToClipboard}
                className="bg-slate-850 text-white font-mono text-xs p-4 rounded-lg max-h-80 overflow-auto cursor-pointer"
              >
                {receiptText}
              </pre>
            </div>
            <div className="p-4 bg-slate-50 border-t flex justify-end gap-3">
              <button onClick={onClose} className="font-medium text-slate-600 hover:text-slate-800 px-6 py-2 rounded-lg">Close</button>
              <button onClick={copyToClipboard} className="btn-primary bg-blue-600 hover:bg-blue-700 py-2.5 px-5"><Copy className="w-4 h-4" /> Copy Text</button>
              <button onClick={onPrint} className="btn-primary py-2.5 px-5"><Printer className="w-4 h-4" /> Print Receipt</button>
            </div>
          </div>
        </div>
      );
    };


    // Super Admin Panel Component
    const SuperAdminPanel = ({ settings, updateSettings, onExit, onLock, clearDataFromDB }) => {
      const handleFactoryReset = async () => {
        if (confirm("WARNING: This will completely wipe all POS data including products, sales, debts, and settings. Are you absolutely sure?")) {
          const check = prompt("FINAL WARNING: This action cannot be undone. Type 'DELETE' to proceed:");
          if (check === 'DELETE') {
            await clearDataFromDB();
            localStorage.clear();
            window.location.reload();
          }
        }
      };

      return (
        <div className="min-h-screen bg-slate-100 p-8">
          <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-xl overflow-hidden">
            <div className="bg-slate-900 p-6 text-white flex justify-between items-center">
              <div>
                <h1 className="text-2xl font-bold">Super Admin Control Panel</h1>
                <p className="text-slate-400 text-sm mt-1">Master configuration and security</p>
              </div>
              <button onClick={onExit} className="btn-secondary bg-white/10 text-white hover:bg-white/20 border-none">Exit to POS</button>
            </div>

            <div className="p-8 space-y-8">
              {/* Scanner Settings */}
              <section className="space-y-4">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><QrCode className="w-5 h-5 text-emerald-600" /> Scanner Configuration</h3>
                <div className="bg-slate-50 p-6 rounded-xl border border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Scanning Area Size (Pixels)</label>
                    <input id="field-1" name="field-1" type="number" className="input-field" value={settings.scannerSize} onChange={e => updateSettings({ ...settings, scannerSize: parseInt(e.target.value) || 250 })} />
                    <p className="text-xs text-slate-500 mt-2">Adjust the visual box size. Default is 250.</p>
                  </div>
                </div>
              </section>

              {/* Security Settings */}
              <section className="space-y-4">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Lock className="w-5 h-5 text-amber-600" /> POS Lock & Security</h3>
                <div className="bg-amber-50 p-6 rounded-xl border border-amber-100 grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-semibold text-amber-900 mb-1">Lock Screen PIN</label>
                    <input id="field-2" name="field-2" type="text" maxLength={8} className="input-field border-amber-200 focus:border-amber-500 focus:ring-amber-200" value={settings.lockPin || ''} onChange={e => updateSettings({ ...settings, lockPin: e.target.value.replace(/\D/g, '') })} placeholder="e.g. 1234" />
                    <p className="text-xs text-amber-700 mt-2">Required to unlock the screen. Master PIN also works.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-amber-900 mb-1">Recovery PIN</label>
                    <input id="field-3" name="field-3" type="text" maxLength={8} className="input-field border-amber-200 focus:border-amber-500 focus:ring-amber-200" value={settings.recoveryPin || ''} onChange={e => updateSettings({ ...settings, recoveryPin: e.target.value.replace(/\D/g, '') })} placeholder="Custom PIN" />
                    <p className="text-xs text-amber-700 mt-2">Used for master recovery. Leave blank to use Master Recovery PIN.</p>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-amber-900 mb-1">Period (Days)</label>
                    <input id="field-4" name="field-4" type="number" className="input-field border-amber-200 focus:border-amber-500 focus:ring-amber-200" value={settings.periodInDays || ''} onChange={e => updateSettings({ ...settings, periodInDays: parseInt(e.target.value) || 0 })} placeholder="e.g. 30" />
                    <p className="text-xs text-amber-700 mt-2">Set the period in days.</p>
                  </div>
                  <div className="flex items-center justify-between bg-amber-100/50 p-4 rounded-xl border border-amber-200">
                    <div>
                      <div className="font-semibold text-sm text-amber-900">Enable Period Lock</div>
                      <div className="text-xs text-amber-700 mt-1">Lock the POS after the specified period.</div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input id="field-5" name="field-5" type="checkbox" className="sr-only peer" checked={settings.enablePeriodLock || false} onChange={e => {
                        const checked = e.target.checked;
                        updateSettings({
                          ...settings,
                          enablePeriodLock: checked,
                          periodStartDate: checked ? (settings.periodStartDate || Date.now()) : null
                        });
                      }} />
                      <div className="w-11 h-6 bg-amber-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-600"></div>
                    </label>
                  </div>
                  <div className="md:col-span-2 pt-4 border-t border-amber-200">
                    <button onClick={onLock} className="btn-primary bg-amber-600 hover:bg-amber-700 shadow-amber-200">Lock POS Instantly</button>
                  </div>
                </div>
              </section>

              {/* Danger Zone */}
              <section className="space-y-4 pt-8 border-t border-slate-200">
                <h3 className="text-lg font-bold text-red-600 flex items-center gap-2"><Trash2 className="w-5 h-5" /> Danger Zone</h3>
                <div className="bg-red-50 p-6 rounded-xl border border-red-100">
                  <p className="text-sm text-red-800 mb-4 font-medium">This action will permanently delete all data from the POS, including products, sales history, debts, and settings.</p>
                  <button onClick={handleFactoryReset} className="btn-primary bg-red-600 hover:bg-red-700 shadow-red-200">Factory Reset (Delete Everything)</button>
                </div>
              </section>
            </div>
          </div>
        </div>
      );
    };

    // 1. Scanner Modal
    const ScannerModal = ({ onScan, onClose, title, scannerSize = 250 }) => {
      const regionId = 'html5-qrcode-reader';
      const isMountedRef = useRef(true);
      const scannerRef = useRef(null);
      const [error, setError] = useState(null);

      useEffect(() => {
        isMountedRef.current = true;
        const scanner = new Html5Qrcode(regionId);
        scannerRef.current = scanner;

        const config = {
          fps: 10,
          qrbox: { width: scannerSize, height: scannerSize },
          aspectRatio: 1.0,
          experimentalFeatures: { useBarCodeDetectorIfSupported: true },
          formatsToSupport: [Html5QrcodeSupportedFormats.EAN_13, Html5QrcodeSupportedFormats.EAN_8, Html5QrcodeSupportedFormats.UPC_A, Html5QrcodeSupportedFormats.CODE_128, Html5QrcodeSupportedFormats.CODE_39]
        };

        const startScanner = async () => {
          try {
            await scanner.start({ facingMode: 'environment' }, config, (decodedText) => { if (isMountedRef.current) { onScan(decodedText); } }, () => { });
          } catch (err) {
            if (isMountedRef.current) {
              console.error("Error starting scanner", err);
              if (err.name === 'NotAllowedError') { setError("Camera access was not granted. To use the scanner, please allow camera permission when prompted. You may need to refresh the page or adjust your browser's site settings."); }
              else { setError("Could not start camera. It might be in use by another application."); }
            }
          }
        };
        startScanner();
        return () => {
          isMountedRef.current = false;
          if (scannerRef.current) {
            try {
              const state = scannerRef.current.getState();
              if (state === Html5QrcodeScannerState.SCANNING || state === Html5QrcodeScannerState.PAUSED) {
                scannerRef.current.stop().catch(err => console.warn("Scanner stop failed", err));
              }
            } catch (e) { console.warn("Error getting scanner state during cleanup", e); }
          }
        };
      }, [onScan]);

      return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden relative shadow-2xl">
            <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-slate-100 rounded-full hover:bg-slate-200 z-20 transition-colors"><X className="w-5 h-5 text-slate-600" /></button>
            <div className="p-4 border-b text-center font-bold text-lg text-slate-800">{title}</div>
            <div className="bg-black relative">
              <div id={regionId} className="w-full h-80 bg-black"></div>
              {error && (<div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/80 p-6 text-center"><AlertTriangle className="w-12 h-12 text-yellow-400 mb-4" /><h3 className="text-lg font-bold text-white mb-2">Camera Access Error</h3><p className="text-sm text-slate-300">{error}</p></div>)}
            </div>
            <div className="p-4 text-center text-sm text-slate-500">Point camera at barcode</div>
          </div>
        </div>
      );
    };

    // --- ERROR BOUNDARY ---
    class ErrorBoundary extends React.Component {
      constructor(props) { super(props); this.state = { hasError: false, error: null }; }
      static getDerivedStateFromError(error) { return { hasError: true, error }; }
      componentDidCatch(error, info) { console.error('ErrorBoundary caught:', error, info); }
      render() {
        if (this.state.hasError) {
          return (
            <div style={{ padding: '40px', textAlign: 'center', background: '#f8fafc', minHeight: '300px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRadius: '16px' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
              <h2 style={{ color: '#1e293b', fontWeight: 700, marginBottom: '8px' }}>Something went wrong</h2>
              <p style={{ color: '#64748b', marginBottom: '24px', maxWidth: '400px' }}>A display error occurred, possibly due to a product with missing data. Try refreshing or clearing the category filter.</p>
              <button onClick={() => this.setState({ hasError: false, error: null })} style={{ background: '#059669', color: 'white', border: 'none', borderRadius: '10px', padding: '12px 28px', fontWeight: 700, cursor: 'pointer', fontSize: '15px' }}>Try Again</button>
            </div>
          );
        }
        return this.props.children;
      }
    }

    // 2. Calculator
    const Calculator = ({ onClose }) => {
      const [disp, setDisp] = useState('0'); const [expr, setExpr] = useState(''); const dragRef = useRef(null);
      const press = (v) => {
        if (v === 'C') { setDisp('0'); setExpr(''); }
        else if (v === '=') { try { const res = Function('"use strict";return (' + expr + ')')(); const val = String(Math.round(res * 100) / 100); setDisp(val); setExpr(val); } catch { setDisp('Error'); setExpr(''); } }
        else { const n = expr + v; setExpr(n); setDisp(n); }
      };
      useEffect(() => {
        const el = dragRef.current;
        if (!el) return;

        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

        const mouseMoveHandler = (ev) => {
          ev.preventDefault();
          pos1 = pos3 - ev.clientX;
          pos2 = pos4 - ev.clientY;
          pos3 = ev.clientX;
          pos4 = ev.clientY;
          el.style.top = (el.offsetTop - pos2) + "px";
          el.style.left = (el.offsetLeft - pos1) + "px";
        };

        const mouseUpHandler = () => {
          document.onmouseup = null;
          document.onmousemove = null;
        };

        const mouseDownHandler = (e) => {
          if (e.target.closest('button')) return;
          e.preventDefault();
          pos3 = e.clientX;
          pos4 = e.clientY;
          document.onmouseup = mouseUpHandler;
          document.onmousemove = mouseMoveHandler;
        };

        el.onmousedown = mouseDownHandler;

        return () => {
          el.onmousedown = null;
          document.onmouseup = null;
          document.onmousemove = null;
        };
      }, []);
      return (<div ref={dragRef} className="fixed bottom-20 right-4 z-50 bg-slate-800 rounded-2xl p-4 shadow-2xl w-64 border border-slate-700 cursor-move" style={{ touchAction: 'none' }}>
        <div className="flex justify-between mb-3 text-slate-400"><span className="text-xs font-bold uppercase">Calculator</span><button onClick={onClose}><X className="w-4 h-4" /></button></div>
        <div className="bg-slate-900 p-3 rounded-lg mb-4 text-right"><span className="text-emerald-400 text-2xl font-mono">{disp}</span></div>
        <div className="grid grid-cols-4 gap-2">{['7', '8', '9', '/', '4', '5', '6', '*', '1', '2', '3', '-', 'C', '0', '.', '+'].map(b => (<button key={b} onClick={() => press(b)} className={`p-3 rounded-lg font-bold text-sm ${['/', '*', '-', '+', '='].includes(b) ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-slate-700 text-slate-200 hover:bg-slate-600'} ${b === 'C' ? 'bg-red-500 text-white' : ''}`}>{b}</button>))}
          <button onClick={() => press('=')} className="col-span-4 bg-emerald-600 text-white py-2 rounded-lg font-bold mt-1 hover:bg-emerald-700">=</button>
          <button onClick={() => { navigator.clipboard.writeText(disp); toast.success('Copied') }} className="col-span-4 text-xs text-slate-400 hover:text-white flex items-center justify-center gap-1 mt-1"><Copy className="w-3 h-3" /> Copy</button>
        </div></div>);
    };

    // 3. Text Import Modal
    const TextImportModal = ({ onClose, onImport, existingProducts, settings }) => { const trackExp = settings?.trackExpiry !== false;
      const [text, setText] = useState(''); const [items, setItems] = useState([]); const [step, setStep] = useState('input'); const [scanIdx, setScanIdx] = useState(null); const [isScanningStock, setIsScanningStock] = useState(false);
      const parse = () => {
        if (!text.trim()) return toast.error('Paste text first'); const lines = text.split('\n').filter(l => l.trim().length);
        const parsed = lines.map(line => {
          const parts = line.split(',').map(p => p.trim()); if (parts.length < 6) return { status: 'error', msg: 'Invalid format', name: line, code: '?', price: 0, category: 'Unknown', cost: 0, stock: 0 };
          const code = parts[0]; const name = parts[1]; const price = parseFloat(parts[2]); const category = parts[3] || 'General'; const cost = parseFloat(parts[4]) || 0; const stock = parseFloat(parts[5]) || 0; const expiryDate = trackExp ? (parts[6] || '') : '';
          const isDup = existingProducts.some(p => (p.barcode && p.barcode === code) || ((p.name || '').toLowerCase() === (name || '').toLowerCase() && p.cost === cost));
          if (isNaN(price) || isNaN(cost) || isNaN(stock)) return { status: 'error', msg: 'Invalid number', name, code, price: 0, category, cost: 0, stock: 0, expiryDate };
          if (isDup) return { status: 'duplicate', msg: 'Barcode or Name/Cost exists', name, code, price, category, cost, stock, expiryDate };
          return { status: 'ready', name, code, price, category, cost, stock, expiryDate, isCommodity: (category || '').toLowerCase() === 'commodity' };
        }); setItems(parsed); setStep('preview');
      };
      const doImport = () => {
        const valid = items.filter(i => i.status === 'ready').map(i => ({ id: crypto.randomUUID(), name: i.name, category: i.category, price: i.price, cost: i.cost, stock: i.stock, expiryDate: i.expiryDate, sold: 0, profit: 0, barcode: i.code, dateAdded: new Date().toISOString(), isCommodity: i.isCommodity, unit: i.isCommodity ? 'Kg' : undefined }));
        if (!valid.length) return toast.error('No valid items'); onImport(valid); onClose(); toast.success(`Imported ${valid.length} items`);
      };
      const handleStockScan = (code) => {
        const itemIndex = items.findIndex(i => i.code === code && i.status !== 'error');
        if (itemIndex > -1) { const newItems = [...items]; newItems[itemIndex].stock = (newItems[itemIndex].stock || 0) + 1; setItems(newItems); toast.success(`${newItems[itemIndex].name} stock: ${newItems[itemIndex].stock}`, { duration: 1500 }); }
        else { toast.error('Product not in import list.', { duration: 1500 }); }
      };
      const handleStockChange = (index, newStock) => { const newItems = [...items]; newItems[index].stock = Math.max(0, parseFloat(newStock) || 0); setItems(newItems); };
      return (<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"><div className="bg-white rounded-2xl w-full max-w-5xl h-[85vh] flex flex-col shadow-2xl relative overflow-hidden">
        <div className="p-4 border-b flex justify-between items-center bg-slate-50"><h3 className="font-bold flex items-center gap-2 text-slate-800"><FileText className="w-5 h-5 text-emerald-600" /> Text Import Editor</h3><button onClick={onClose}><X className="w-5 h-5 text-slate-500 hover:text-slate-800" /></button></div>
        <div className="flex-1 p-6 overflow-hidden flex flex-col">{step === 'input' ? (<><div className="bg-blue-50 text-blue-800 p-4 rounded-lg mb-4 text-sm border border-blue-100"><strong>Format Guide (CSV):</strong> <code>Barcode, Name, Price, Category, Cost, Stock{trackExp ? ', Expiry Date (Optional MM/YYYY)' : ''}</code><br />Example: <code>12345, Brake Pad, 2500, Spares, 1800, 10{trackExp ? ', 12/2027' : ''}</code></div><textarea className="flex-1 w-full border border-slate-300 rounded-xl p-4 font-mono text-sm focus:ring-2 focus:ring-emerald-500 outline-none resize-none" placeholder="Paste products here..." value={text} onChange={e => setText(e.target.value)}></textarea><div className="flex justify-end mt-4"><button onClick={parse} className="btn-primary py-3 px-6">Parse & Preview <ArrowRight className="w-4 h-4" /></button></div></>) : (<><div className="flex-1 overflow-auto border rounded-xl"><table className="w-full text-sm text-left"><thead className="bg-slate-50 text-slate-500 sticky top-0 z-10"><tr><th className="p-3">Status</th><th className="p-3">Barcode</th><th className="p-3">Name</th><th className="p-3">Category</th><th className="p-3 text-right">Price</th><th className="p-3 text-right">Cost</th><th className="p-3 text-center">Stock</th>{trackExp && <th className="p-3 text-center">Expiry</th>}</tr></thead><tbody className="divide-y">{items.map((it, i) => (<tr key={i} className={it.status === 'ready' ? 'bg-white' : 'bg-slate-50'}><td className="p-3 text-xs font-bold">{it.status === 'ready' && <span className="text-emerald-600 flex items-center gap-1"><Check className="w-3 h-3" /> Ready</span>}{it.status === 'duplicate' && <span className="text-amber-500 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Duplicate</span>}{it.status === 'error' && <span className="text-red-500 flex items-center gap-1"><X className="w-3 h-3" /> {it.msg}</span>}</td><td className="p-3 font-mono text-xs"><div className="flex items-center gap-2">{it.code}<button onClick={() => setScanIdx(i)} className="p-1 bg-slate-100 hover:bg-emerald-100 hover:text-emerald-600 rounded-full" title="Scan Barcode"><Scan className="w-3 h-3" /></button></div></td><td className="p-3 font-medium">{it.name}</td><td className="p-3 text-slate-500">{it.category}</td><td className="p-3 text-right font-bold">{it.price}</td><td className="p-3 text-right text-slate-500">{it.cost}</td><td className="p-3 text-center"><input id="field-6" name="field-6" type="number" min="0" value={it.stock} onChange={(e) => handleStockChange(i, e.target.value)} className="input-field py-1 text-center w-20 mx-auto" disabled={it.status !== 'ready'} /></td>{trackExp && <td className="p-3 text-center">{it.expiryDate || '-'}</td>}</tr>))}</tbody></table></div><div className="mt-4 flex justify-between items-center"><button onClick={() => setStep('input')} className="text-slate-500 hover:text-slate-800 font-medium">Back to Editor</button><div className="flex items-center gap-4"><span className="text-sm text-slate-500"><strong>{items.filter(i => i.status === 'ready').length}</strong> valid items</span><button onClick={() => setIsScanningStock(true)} className="btn-primary bg-blue-600 hover:bg-blue-700 py-3 px-6"><Scan className="w-4 h-4" /> Scan Stock</button><button onClick={doImport} className="btn-primary py-3 px-8"><Upload className="w-4 h-4" /> Import Products</button></div></div></>)}</div>
        {scanIdx !== null && (<ScannerModal title="Update Barcode" onClose={() => setScanIdx(null)} onScan={(c) => { const copy = [...items]; const isDup = existingProducts.some(p => p.barcode === c); copy[scanIdx].code = c; copy[scanIdx].status = isDup ? 'duplicate' : 'ready'; copy[scanIdx].msg = isDup ? 'Barcode exists' : undefined; setItems(copy); setScanIdx(null); toast.success('Barcode updated'); }} scannerSize={superAdminSettings?.scannerSize} />)}
        {isScanningStock && (<ScannerModal title="Scan to Add Stock" onClose={() => setIsScanningStock(false)} onScan={handleStockScan} scannerSize={superAdminSettings?.scannerSize} />)}
      </div></div>);
    };

        // 4. Order Modal
    const OrderModal = ({ initialProducts, suppliers, shopName, onClose, initialSupplierId }) => {
      const [selectedSupplierId, setSelectedSupplierId] = useState(initialSupplierId || suppliers[0]?.id || '');
      const [quantities, setQuantities] = useState(() =>
        initialProducts.reduce((acc, p) => ({ ...acc, [(p && p.id)]: 1 }), {})
      );
      const [selectedProductIds, setSelectedProductIds] = useState(() => new Set(initialProducts.map(p => (p && p.id))));

      const handleQtyChange = (productId, qty) => {
        const newQty = Math.max(1, parseInt(qty, 10) || 1);
        setQuantities(prev => ({ ...prev, [productId]: newQty }));
      };

      const toggleProduct = (id) => {
        const newSet = new Set(selectedProductIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedProductIds(newSet);
      };

      const toggleAll = (e) => {
        if (e.target.checked) setSelectedProductIds(new Set(initialProducts.map(p => (p && p.id))));
        else setSelectedProductIds(new Set());
      };

      const generateMessage = () => {
        const supplier = suppliers.find(s => s.id === selectedSupplierId);
        if (!supplier) {
          toast.error("Please select a supplier.");
          return;
        }

        const selectedItems = initialProducts.filter(p => selectedProductIds.has((p && p.id)));
        if (selectedItems.length === 0) {
          toast.error("Please select at least one product.");
          return;
        }

        const itemsList = selectedItems.map(p => `- ${p.name}: ${quantities[(p && p.id)]}`).join('\n');
        const message = `Hello ${supplier.name},\n\nThis is a supply request from *${shopName}*.\nPlease provide a quote for the following items:\n\n${itemsList}\n\nThank you.`;

        const phone = supplier.phone.replace(/\D/g, '').replace(/^0/, '254');
        const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
        window.open(url, '_blank');
        toast.success("WhatsApp message prepared!");
        onClose();
      };

      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl relative">
            <div className="p-4 border-b flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2"><Truck className="w-5 h-5 text-emerald-600" /> Create Supplier Order</h3>
              <button onClick={onClose}><X className="w-5 h-5 text-slate-500 hover:text-slate-800" /></button>
            </div>
            <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
              <div>
                <label className="text-sm font-medium text-slate-600 block mb-1">Select Supplier</label>
                <select value={selectedSupplierId} onChange={e => setSelectedSupplierId(e.target.value)} className="input-field">
                  {suppliers.length > 0 ? suppliers.map(s => <option key={s.id} value={s.id}>{s.name} - {s.phone}</option>) : <option disabled>No suppliers added</option>}
                </select>
              </div>
              <div>
                <div className="flex justify-between items-center mb-2">
                  <h4 className="font-semibold text-slate-700">Order Items</h4>
                  <label className="flex items-center gap-2 text-sm text-slate-600 font-medium cursor-pointer">
                    <input id="field-7" name="field-7" type="checkbox" checked={selectedProductIds.size === initialProducts.length && initialProducts.length > 0} onChange={toggleAll} className="w-4 h-4 text-emerald-600 rounded" />
                    Select All
                  </label>
                </div>
                <div className="space-y-2">
                  {initialProducts.map(p => (
                    <div key={(p && p.id)} className="grid grid-cols-4 items-center gap-4 p-2 bg-slate-50 rounded-lg">
                      <div className="col-span-3 flex items-center gap-3">
                        <input id="field-8" name="field-8" type="checkbox" checked={selectedProductIds.has((p && p.id))} onChange={() => toggleProduct((p && p.id))} className="w-4 h-4 text-emerald-600 rounded" />
                        <span className="font-medium text-sm text-slate-800 truncate">{p.name}</span>
                      </div>
                      <input id="field-9" name="field-9" type="number" value={quantities[(p && p.id)]} onChange={e => handleQtyChange((p && p.id), e.target.value)} disabled={!selectedProductIds.has((p && p.id))} className="input-field py-1.5 text-center disabled:bg-slate-200 disabled:text-slate-400" placeholder="Qty" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-4 bg-slate-50 border-t flex justify-end">
              <button onClick={generateMessage} disabled={!selectedSupplierId || selectedProductIds.size === 0} className="btn-primary py-3 px-6 disabled:bg-slate-300">
                <Send className="w-4 h-4" /> Generate WhatsApp Message
              </button>
            </div>
          </div>
        </div>
      );
    };

    // 5. Product Selector Modal
    const ProductSelectorModal = ({ allProducts, initialSelectedIds, onClose, onSave }) => {
      const [selectedIds, setSelectedIds] = useState(new Set(initialSelectedIds));
      const [searchTerm, setSearchTerm] = useState('');

      const handleToggle = (id) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedIds(newSet);
      };

      const filteredProducts = useMemo(() => allProducts.filter(p =>
        (p.name || '').toLowerCase().includes(searchTerm.toLowerCase())
      ), [allProducts, searchTerm]);

      return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl h-[80vh] flex flex-col shadow-2xl">
            <div className="p-4 border-b flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-800">Select Products</h3>
              <button onClick={onClose}><X className="w-5 h-5 text-slate-500 hover:text-slate-800" /></button>
            </div>
            <div className="p-4 border-b">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input id="field-10" name="field-10" className="input-field pl-10"
                  placeholder="Search products..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {filteredProducts.map(p => (
                <label key={(p && p.id)} className="flex items-center gap-4 p-3 hover:bg-slate-50 rounded-lg cursor-pointer">
                  <input id="field-11" name="field-11" type="checkbox"
                    className="w-5 h-5 text-emerald-600 bg-gray-100 border-gray-300 rounded focus:ring-emerald-500"
                    checked={selectedIds.has((p && p.id))}
                    onChange={() => handleToggle((p && p.id))}
                  />
                  <span className="font-medium text-sm text-slate-800">{p.name}</span>
                </label>
              ))}
            </div>
            <div className="p-4 bg-slate-50 border-t flex justify-end gap-3">
              <button onClick={onClose} className="font-medium text-slate-600 hover:text-slate-800 px-6 py-2 rounded-lg">Cancel</button>
              <button onClick={() => onSave(Array.from(selectedIds))} className="btn-primary py-2 px-6">
                Update Products ({selectedIds.size})
              </button>
            </div>
          </div>
        </div>
      );
    };

    // --- MAIN PANELS (HELPER COMPONENTS) ---
    const CartItem = ({ item, onUpdate, onRemove, currentUser }) => {
      const canDiscount = currentUser?.role === 'owner' || currentUser?.permissions?.canDiscount;
      return (<div className="p-3 border-b border-slate-100 space-y-2">
        <div className="flex justify-between items-start"><div className="font-medium text-sm text-slate-800 flex-1 pr-2">{item.name}</div><button aria-label="Remove item" onClick={() => onRemove(item.cartId)} className="p-1 -mr-1 text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button></div>
        <div className="flex items-center gap-3"><input id="field-12" name="field-12" type="number" step="any" value={item.quantity} onChange={(e) => onUpdate(item.cartId, { quantity: parseFloat(e.target.value) || 0 })} className="input-field p-1.5 text-center w-20" /><span className="text-xs text-slate-400">x</span><span className="text-sm font-medium text-slate-600">Ksh {item.price.toLocaleString()}</span><span className="text-sm font-bold text-slate-800 ml-auto">Ksh ${(item.price * item.quantity).toLocaleString()}</span></div>
        {canDiscount && <div className="flex items-center gap-2"><select value={item.discountType} onChange={(e) => onUpdate(item.cartId, { discountType: e.target.value })} className="input-field p-1.5 text-xs w-24"><option value="amount">Discount Ksh</option><option value="percent">Discount %</option></select><input id="field-13" name="field-13" type="number" value={item.discountValue} onChange={(e) => onUpdate(item.cartId, { discountValue: parseFloat(e.target.value) || 0 })} className="input-field p-1.5 text-xs" placeholder="Value" /></div>}
      </div>);
    };

    const KPICard = ({ title, val, icon: Icon, color, bg }) => {
      const displayValue = useMemo(() => {
        if (typeof val !== 'number') return val.toLocaleString();
        if (title.includes('Stock Items') || title.includes('Stock Sold') || title.includes('Products')) { // Specific check for quantity
          return val.toLocaleString();
        }
        // Assume currency for other numeric values
        return `Ksh. ${val.toLocaleString()}`;
      }, [val, title]);

      return (<div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between hover:shadow-md transition-shadow"><div><p className="text-sm text-slate-500 mb-1">{title}</p><p className="text-2xl font-bold text-slate-800">{displayValue}</p></div><div className={`p-3 rounded-full ${bg}`}><Icon className={`w-6 h-6 ${color}`} /></div></div>);
    };

    const HistoryModal = ({ title, children, searchVal, onSearchChange, dateRange, onDateChange, onClose, onClear, canDelete }) => (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"><div className="bg-white rounded-xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl"><div className="p-4 border-b flex justify-between items-center gap-4 bg-slate-50 rounded-t-xl text-slate-800"><div className="font-bold text-lg">{title}</div><div className="flex-1 flex gap-2 items-center"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><input id="field-14" name="field-14" value={searchVal} onChange={e => onSearchChange(e.target.value)} className="input-field py-1.5 pl-9 text-sm" placeholder="Search..." /></div><input id="field-15" name="field-15" type="date" value={dateRange.start} onChange={e => onDateChange({ ...dateRange, start: e.target.value })} className="input-field py-1.5 text-sm" /><input id="field-16" name="field-16" type="date" value={dateRange.end} onChange={e => onDateChange({ ...dateRange, end: e.target.value })} className="input-field py-1.5 text-sm" /></div><button onClick={onClose} className="p-1 hover:bg-slate-200 rounded-full"><X className="w-5 h-5 text-slate-600" /></button></div><div className="flex-1 overflow-auto p-4">{children}</div><div className="p-4 border-t bg-slate-50 flex justify-between rounded-b-xl">{canDelete && <button onClick={onClear} className="text-red-600 border border-red-200 bg-red-50 px-4 py-2 rounded-lg hover:bg-red-100 flex items-center gap-2 font-medium"><Trash2 className="w-4 h-4" /> Clear History</button>}{!canDelete && <div />}<button onClick={onClose} className="bg-slate-800 text-white px-6 py-2 rounded-lg hover:bg-slate-900">Close</button></div></div></div>);

    // --- MAIN PANELS ---
    const CartPanel = ({ cart, onUpdate, onRemove, onClear, onCheckout, currentUser }) => {
      const { subtotal, totalDiscount, grandTotal } = useMemo(() => {
        let subtotal = 0, totalDiscount = 0;
        cart.forEach(item => { const itemTotal = item.price * item.quantity; subtotal += itemTotal; totalDiscount += item.discountType === 'percent' ? itemTotal * (item.discountValue / 100) : item.discountValue; });
        return { subtotal, totalDiscount, grandTotal: subtotal - totalDiscount };
      }, [cart]);

      return (<div className="card max-h-[calc(100vh-6rem)] flex flex-col p-0">
        <div className="p-4 border-b flex justify-between items-center"><h3 className="font-bold text-slate-800 flex items-center gap-2"><ShoppingCart className="w-5 h-5 text-emerald-600" /> Shopping Cart</h3><button onClick={onClear} className="text-xs font-medium text-red-500 hover:text-red-700 hover:underline">Clear</button></div>
        <div className="flex-1 overflow-y-auto">{cart.length === 0 ? (<div className="p-10 text-center text-slate-400"><ShoppingBag className="w-12 h-12 mx-auto mb-2" /><p>Cart is empty</p></div>) : (cart.map(item => <CartItem key={item.cartId} item={item} onUpdate={onUpdate} onRemove={onRemove} currentUser={currentUser} />))}</div>
        {cart.length > 0 && (<div className="p-4 border-t bg-slate-50 space-y-4">
          <div className="space-y-1 text-sm"><div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span className="font-medium">Ksh {subtotal.toLocaleString()}</span></div><div className="flex justify-between"><span className="text-slate-500">Discount</span><span className="font-medium text-red-500">- Ksh {totalDiscount.toLocaleString()}</span></div></div>
          <div className="flex justify-between items-center font-bold text-xl border-t pt-3 mt-3"><span className="text-slate-800">Total</span><span className="text-emerald-600">Ksh {grandTotal.toLocaleString()}</span></div>
          <button onClick={onCheckout} className="btn-primary w-full py-3.5 text-base">Proceed to Checkout</button>
        </div>)}
      </div>);
    };

    const CheckoutModal = ({ cart, onConfirm, onClose, currentUser, printData, settings, customers, updateCustomers }) => {
      const [paymentMethod, setPaymentMethod] = useState('Cash');
      const [cashGiven, setCashGiven] = useState(0);
      const [confirmedSaleDetails, setConfirmedSaleDetails] = useState(null);
      const [customerName, setCustomerName] = useState('');
      const [customerPhone, setCustomerPhone] = useState('+254');
      const [customerSearch, setCustomerSearch] = useState('');

      const totals = useMemo(() => { let subtotal = 0, totalDiscount = 0; cart.forEach(item => { const itemTotal = item.price * item.quantity; subtotal += itemTotal; totalDiscount += item.discountType === 'percent' ? itemTotal * (item.discountValue / 100) : item.discountValue; }); return { subtotal, totalDiscount, grandTotal: subtotal - totalDiscount }; }, [cart]);

      const change = cashGiven - totals.grandTotal;

      const isPhoneValid = useMemo(() => {
        if (!customerPhone) return false;
        const digits = customerPhone.replace(/\D/g, '');
        return digits.length >= 10;
      }, [customerPhone]);

      const generateWhatsAppMessage = (details) => {
        if (!details) return '';
        const { cart, totals, settings, cashierName, customer, payment } = details;
        const now = new Date();
        const invoiceNumber = `INV-${now.getTime().toString().slice(-6)}`;

        let message = `*${settings.name}*\n`;
        message += `Tel: ${settings.phone}\n\n`;
        message += `*RECEIPT*\n`;
        message += `Invoice #: ${invoiceNumber}\n`;
        message += `Served By: ${cashierName}\n`;
        if (customer?.name) message += `Customer: ${customer.name}\n`;
        message += `-----------------------------------\n`;
        cart.forEach(item => {
          message += `${item.name}\n`;
          message += `  ${item.quantity} x ${(Number() || 0).toFixed(2)} = ${(Number(item.quantity * item.price) || 0).toFixed(2)}\n`;
        });
        message += `-----------------------------------\n`;
        message += `*TOTAL: Ksh ${(Number() || 0).toFixed(2)}*\n`;
        if (totals.totalDiscount > 0) message += `(Discount Applied: Ksh ${(Number() || 0).toFixed(2)})\n`;
        message += `Paid (${payment.method}): Ksh ${payment.method === 'Cash' ? (Number() || 0).toFixed(2) : (Number() || 0).toFixed(2)}\n`;
        if (payment.method === 'Cash' && payment.change > 0) message += `Change: Ksh ${(Number() || 0).toFixed(2)}\n`;
        message += `\n${settings.receiptFooter}`;
        return message;
      };

      const handleConfirm = () => {
        if (paymentMethod === 'Cash' && cashGiven < totals.grandTotal) { return toast.error('Cash given is less than the total amount.'); }

        // Auto-add new customer if details are filled and they don't exist
        if (customerName && isPhoneValid && !customers.some(c => c.name === customerName && c.phone === customerPhone)) {
          const newCustomer = { id: crypto.randomUUID(), name: customerName, phone: customerPhone };
          updateCustomers([...customers, newCustomer]);
          toast.success(`${customerName} added to customers.`, { duration: 2000 });
        }

        const saleDetails = { cart, totals, payment: { method: paymentMethod, cashGiven, change }, customer: { name: customerName, phone: customerPhone } };
        onConfirm(saleDetails);
        setConfirmedSaleDetails(saleDetails);
      };

      const handlePrint = () => { if (!confirmedSaleDetails) return; printData({ ...confirmedSaleDetails, settings, cashierName: currentUser?.name }); }

      const handleSendWhatsApp = () => {
        if (!confirmedSaleDetails || !isPhoneValid) return;
        const phoneForWhatsapp = customerPhone.replace(/\D/g, '').replace(/^0/, '254');
        const message = generateWhatsAppMessage({ ...confirmedSaleDetails, settings, cashierName: currentUser?.name });
        const url = `https://wa.me/${phoneForWhatsapp}?text=${encodeURIComponent(message)}`;
        window.open(url, '_blank');
        toast.success("WhatsApp message prepared!");
      };

      const handleSelectCustomer = (customer) => {
        setCustomerName(customer.name);
        setCustomerPhone(customer.phone);
        setCustomerSearch('');
      }

      useEffect(() => { if (totals.grandTotal > 0) setCashGiven(totals.grandTotal); }, [totals.grandTotal]);

      const filteredCustomers = useMemo(() => customerSearch ? customers.filter(c => (c.name || '').toLowerCase().includes(customerSearch.toLowerCase()) || c.phone.includes(customerSearch)) : [], [customers, customerSearch]);

      return (<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"><div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl relative">
        <div className="p-4 border-b flex justify-between items-center bg-slate-50">
          <h3 className="font-bold text-slate-800">{confirmedSaleDetails ? 'Sale Complete' : 'Checkout'}</h3>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-500 hover:text-slate-800" /></button>
        </div>
        {confirmedSaleDetails ? (
          <div className="p-6 text-center">
            <CheckCircle className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
            <h3 className="text-2xl font-bold text-slate-800">Sale Confirmed!</h3>
            {confirmedSaleDetails.payment.change > 0 && (<p className="text-lg text-slate-500 mt-2">Change due: <span className="font-bold text-blue-600 text-xl">Ksh. {confirmedSaleDetails.payment.change.toLocaleString()}</span></p>)}
            <div className="my-6 text-slate-600 font-medium">How would you like the receipt?</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <button onClick={handleSendWhatsApp} disabled={!isPhoneValid} className="btn-primary py-3 disabled:bg-slate-300 disabled:shadow-none">
                <Send className="w-4 h-4" /> WhatsApp
              </button>
              <button onClick={handlePrint} className="btn-primary py-3 bg-slate-600 hover:bg-slate-700">
                <Printer className="w-4 h-4" /> Print
              </button>
            </div>
            {!isPhoneValid && confirmedSaleDetails.customer.phone && <p className="text-xs text-red-500 -mt-4 mb-4">A valid phone number is required for WhatsApp.</p>}
            <button onClick={onClose} className="font-bold text-emerald-600 hover:underline w-full py-3">Start New Sale</button>
          </div>
        ) : (<>
          <div className="p-6 space-y-4"><div className="bg-slate-50 p-4 rounded-lg space-y-2 border border-slate-200"><div className="flex justify-between text-sm"><span className="text-slate-500">Subtotal:</span><span className="font-medium">Ksh. {totals.subtotal.toLocaleString()}</span></div><div className="flex justify-between text-sm"><span className="text-slate-500">Discount:</span><span className="font-medium text-red-500">- Ksh. {totals.totalDiscount.toLocaleString()}</span></div><div className="flex justify-between text-lg font-bold"><span className="text-slate-800">Total Price:</span><span className="text-emerald-600">Ksh. {totals.grandTotal.toLocaleString()}</span></div></div><div className="grid grid-cols-2 gap-4"><div><label className="text-sm font-medium text-slate-600">Payment Method</label><select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className="input-field"><option value="Cash">Cash</option><option value="M-Pesa">M-Pesa</option></select></div>{paymentMethod === 'Cash' && (<div><label className="text-sm font-medium text-slate-600">Cash Given</label><input id="field-17" name="field-17" type="number" value={cashGiven} onChange={e => setCashGiven(parseFloat(e.target.value) || 0)} className="input-field" /><div className="flex gap-1 mt-2"><button onClick={() => setCashGiven(100)} className="flex-1 bg-slate-100 hover:bg-emerald-100 hover:text-emerald-700 text-slate-600 py-1 rounded text-xs font-medium transition-colors">100</button><button onClick={() => setCashGiven(200)} className="flex-1 bg-slate-100 hover:bg-emerald-100 hover:text-emerald-700 text-slate-600 py-1 rounded text-xs font-medium transition-colors">200</button><button onClick={() => setCashGiven(500)} className="flex-1 bg-slate-100 hover:bg-emerald-100 hover:text-emerald-700 text-slate-600 py-1 rounded text-xs font-medium transition-colors">500</button><button onClick={() => setCashGiven(1000)} className="flex-1 bg-slate-100 hover:bg-emerald-100 hover:text-emerald-700 text-slate-600 py-1 rounded text-xs font-medium transition-colors">1000</button></div></div>)}</div>{paymentMethod === 'Cash' && change >= 0 && (<div className="flex justify-between text-lg font-bold border-t pt-3 mt-3"><span className="text-slate-800">Change:</span><span className="text-blue-600">Ksh. {change.toLocaleString()}</span></div>)}
            <div className="pt-4 border-t mt-4 space-y-3">
              <h4 className="text-sm font-semibold text-slate-700">Customer Details (Optional)</h4>
              <div className="relative">
                <input id="field-18" name="field-18" type="text" value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} className="input-field" placeholder="Search existing customer..." />
                {filteredCustomers.length > 0 && (
                  <div className="absolute z-10 w-full bg-white border rounded-lg mt-1 max-h-32 overflow-auto shadow-lg">
                    {filteredCustomers.map(c => <div key={c.id} onClick={() => handleSelectCustomer(c)} className="p-2 hover:bg-emerald-50 cursor-pointer text-sm">{c.name} - {c.phone}</div>)}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <input id="field-19" name="field-19" type="text" value={customerName} onChange={e => setCustomerName(e.target.value)} className="input-field" placeholder="Customer Name" />
                <input id="field-20" name="field-20" type="text" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} className="input-field" placeholder="Phone e.g. +2547..." />
              </div>
            </div>
          </div>
          <div className="p-4 bg-slate-50 border-t flex justify-end"><button onClick={handleConfirm} className="btn-primary py-3 px-8">Confirm Sale</button></div></>)}
      </div></div>);
    };


    const BulkPriceUpdateModal = ({ products, setProducts, onClose, currentUser, suppliers }) => {
      const [scope, setScope] = useState('all');
      const [catScope, setCatScope] = useState('');
      const [supplierScope, setSupplierScope] = useState('');
      const [selectedProductIds, setSelectedProductIds] = useState(new Set());
      const [search, setSearch] = useState('');
      const [adjustmentType, setAdjustmentType] = useState('percentage');
      const [action, setAction] = useState('increase');
      const [value, setValue] = useState('');
      const [previewMode, setPreviewMode] = useState(false);
      const [previewData, setPreviewData] = useState([]);

      const cats = useMemo(() => [...new Set(products.map(p => (p && p.category)))].filter(Boolean).sort((a, b) => a.localeCompare(b)), [products]);
      const filteredForSelection = useMemo(() => products.filter(p => (p.name || '').toLowerCase().includes(search.toLowerCase()) || (p.barcode && p.barcode.includes(search))), [products, search]);

      const generatePreview = () => {
        let affected = [];
        if (scope === 'all') affected = products;
        else if (scope === 'category') affected = products.filter(p => (p && p.category) === catScope);
        else if (scope === 'supplier') affected = products.filter(p => suppliers?.find(s => s.id === supplierScope)?.productIds?.includes((p && p.id)));
        else if (scope === 'selected') affected = products.filter(p => selectedProductIds.has((p && p.id)));

        if (affected.length === 0) return toast.error('No products found for this scope.');
        
        const val = parseFloat(value);
        if (isNaN(val) || val <= 0) return toast.error('Enter a valid positive value.');

        const preview = affected.map(p => {
          let newPrice = p.price;
          if (adjustmentType === 'percentage') {
             const change = p.price * (val / 100);
             newPrice = action === 'increase' ? p.price + change : p.price - change;
          } else {
             newPrice = action === 'increase' ? p.price + val : p.price - val;
          }
          return { ...p, newPrice: Math.max(0, newPrice) };
        });
        setPreviewData(preview);
        setPreviewMode(true);
      };

      const handleApply = () => {
        const affectedIds = new Set(previewData.map(p => (p && p.id)));
        const updatedProducts = products.map(p => {
           const previewItem = previewData.find(x => x.id === (p && p.id));
           return previewItem ? { ...p, price: previewItem.newPrice } : p;
        });

        // Audit Log
        const log = {
          date: new Date().toISOString(),
          userId: currentUser?.id || currentUser?.role,
          userName: currentUser?.name || currentUser?.role,
          scope, adjustmentType, action, value,
          affectedCount: previewData.length,
          affectedIds: Array.from(affectedIds)
        };
        const existingLogs = JSON.parse(localStorage.getItem('bulkPriceAuditLogs') || '[]');
        localStorage.setItem('bulkPriceAuditLogs', JSON.stringify([...existingLogs, log]));

        setProducts(updatedProducts);
        toast.success(`Updated prices for ${previewData.length} products.`);
        onClose();
      };

      if (previewMode) {
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
              <div className="p-4 border-b flex justify-between items-center"><h3 className="font-bold text-lg">Preview Price Changes</h3></div>
              <div className="p-4 flex-1 overflow-auto">
                <p className="mb-4 text-slate-600">Products Affected: <strong>{previewData.length}</strong></p>
                <table className="w-full text-left text-sm"><thead className="bg-slate-50"><tr><th className="p-2">Product</th><th className="p-2">Current</th><th className="p-2">New</th><th className="p-2">Diff</th></tr></thead>
                <tbody>
                  {previewData.slice(0, 100).map(p => (
                    <tr key={(p && p.id)} className="border-b"><td className="p-2">{p.name}</td><td className="p-2 text-slate-500">{(Number() || 0).toFixed(2)}</td><td className="p-2 font-bold text-emerald-600">{(Number() || 0).toFixed(2)}</td><td className="p-2 text-xs">{(Number(p.newPrice - p.price) || 0).toFixed(2)}</td></tr>
                  ))}
                  {previewData.length > 100 && <tr><td colSpan="4" className="p-2 text-center text-slate-400">...and {previewData.length - 100} more</td></tr>}
                </tbody></table>
              </div>
              <div className="p-4 border-t bg-slate-50 flex justify-end gap-3"><button onClick={() => setPreviewMode(false)} className="px-4 py-2 text-slate-600 bg-slate-200 rounded-lg">Back</button><button onClick={handleApply} className="px-4 py-2 text-white bg-emerald-600 rounded-lg font-bold">Apply Changes</button></div>
            </div>
          </div>
        );
      }

      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 border-b flex justify-between items-center"><h3 className="font-bold text-lg flex items-center gap-2"><Edit2 className="w-5 h-5 text-blue-600" /> Bulk Price Update</h3><button onClick={onClose}><X className="w-5 h-5" /></button></div>
            <div className="p-6 overflow-auto flex-1 space-y-6">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Apply To:</label>
                <div className="flex flex-wrap gap-4">
                  {['all', 'category', 'supplier', 'selected'].map(s => (
                    <label key={s} className="flex items-center gap-2 cursor-pointer"><input id="field-21" name="field-21" type="radio" checked={scope === s} onChange={() => setScope(s)} className="text-emerald-600" /> <span className="capitalize">{s} Products</span></label>
                  ))}
                </div>
              </div>
              
              {scope === 'category' && (<select value={catScope} onChange={e => setCatScope(e.target.value)} className="input-field w-full"><option value="">Select Category...</option>{cats.map(c => <option key={c} value={c}>{c}</option>)}</select>)}
              {scope === 'supplier' && (<select value={supplierScope} onChange={e => setSupplierScope(e.target.value)} className="input-field w-full"><option value="">Select Supplier...</option>{suppliers?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>)}
              {scope === 'selected' && (
                 <div className="border border-slate-200 rounded-xl p-3 max-h-48 overflow-auto">
                   <input id="field-22" name="field-22" className="input-field mb-2" placeholder="Search to select..." value={search} onChange={e => setSearch(e.target.value)} />
                   {filteredForSelection.map(p => (
                     <label key={(p && p.id)} className="flex items-center gap-2 py-1"><input id="field-23" name="field-23" type="checkbox" checked={selectedProductIds.has((p && p.id))} onChange={e => { const newSet = new Set(selectedProductIds); e.target.checked ? newSet.add((p && p.id)) : newSet.delete((p && p.id)); setSelectedProductIds(newSet); }} /> {p.name} - Ksh {p.price}</label>
                   ))}
                 </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-bold text-slate-700 mb-2">Adjustment Type:</label><select value={adjustmentType} onChange={e => setAdjustmentType(e.target.value)} className="input-field w-full"><option value="percentage">Percentage (%)</option><option value="fixed">Fixed Amount (KSh)</option></select></div>
                <div><label className="block text-sm font-bold text-slate-700 mb-2">Action:</label><select value={action} onChange={e => setAction(e.target.value)} className="input-field w-full"><option value="increase">Increase (+)</option><option value="decrease">Decrease (-)</option></select></div>
              </div>
              
              <div><label className="block text-sm font-bold text-slate-700 mb-2">Value:</label><input id="field-24" name="field-24" type="number" className="input-field w-full text-lg font-bold" value={value} onChange={e => setValue(e.target.value)} placeholder="0.00" /></div>
            </div>
            <div className="p-4 border-t bg-slate-50 flex justify-end gap-3"><button onClick={onClose} className="px-4 py-2 text-slate-600 bg-slate-200 rounded-lg">Cancel</button><button onClick={generatePreview} className="px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-lg font-bold">Preview Changes</button></div>
          </div>
        </div>
      );
    };
    const Pagination = ({ totalItems, itemsPerPage, currentPage, setCurrentPage }) => {
      const totalPages = Math.ceil(totalItems / itemsPerPage);
      if (totalPages <= 1) return null;
      
      const getPages = () => {
        let pages = [];
        for (let i = 1; i <= totalPages; i++) {
          if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
            pages.push(i);
          } else if (pages[pages.length - 1] !== '...') {
            pages.push('...');
          }
        }
        return pages;
      };

      return (
        <div className="flex justify-center items-center gap-2 mt-6 mb-2 flex-wrap">
          <button onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1} className="px-3 py-1 bg-white border border-slate-200 rounded-md text-slate-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors">Prev</button>
          {getPages().map((p, i) => (
            <button key={i} onClick={() => p !== '...' && setCurrentPage(p)} disabled={p === '...'} className={`px-3 py-1 border rounded-md transition-colors ${p === currentPage ? 'bg-emerald-600 text-white border-emerald-600 font-bold' : p === '...' ? 'border-transparent text-slate-400 bg-transparent cursor-default' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{p}</button>
          ))}
          <button onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages} className="px-3 py-1 bg-white border border-slate-200 rounded-md text-slate-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors">Next</button>
        </div>
      );
    };

    const ProductPanel = ({ settings, superAdminSettings, products, setProducts, currentUser, processSale, printData, suppliers, customers, updateCustomers, stockHistory, setStockHistory, cart, setCart }) => {
      const [search, setSearch] = useState(''); const [cat, setCat] = useState(''); const [scannerMode, setScannerMode] = useState(null); const [showImport, setShowImport] = useState(false); const [updateId, setUpdateId] = useState(null); const [form, setForm] = useState({ name: '', price: '', cost: '', stock: '', cat: '', code: '', isCommodity: false, unit: 'Kg', expiryDate: '' }); const [showBulkPriceUpdate, setShowBulkPriceUpdate] = useState(false); const [activeTab, setActiveTab] = useState('all'); const [editId, setEditId] = useState(null); const [editData, setEditData] = useState({}); const [isCheckingOut, setIsCheckingOut] = useState(false); const [showOrderModal, setShowOrderModal] = useState(false); const [showShoppingListModal, setShowShoppingListModal] = useState(false); const [shoppingListItems, setShoppingListItems] = useState([]); const [printShoppingListNow, setPrintShoppingListNow] = useState(false); const [selectedOrderItems, setSelectedOrderItems] = useState([]); const [initialSupplierId, setInitialSupplierId] = useState(null); const [showAttractMode, setShowAttractMode] = useState(false); const [showAddProduct, setShowAddProduct] = useState(false); const role = currentUser?.role; const perms = currentUser?.permissions || {};

      // Voice Assistant States and Logic
      const [isListening, setIsListening] = useState(false);
      const [voiceFeedback, setVoiceFeedback] = useState('');
      const [voiceError, setVoiceError] = useState('');
      const recognitionRef = useRef(null);

      const speak = useCallback((text) => {
        if (!window.speechSynthesis) return;
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        const voices = window.speechSynthesis.getVoices();
        const engVoice = voices.find(v => v.lang.startsWith('en')) || voices[0];
        if (engVoice) utterance.voice = engVoice;
        utterance.rate = 1.0;
        window.speechSynthesis.speak(utterance);
      }, []);

      const updateCartItem = (cartId, updatedValues) => { setCart(currentCart => currentCart.map(item => item.cartId === cartId ? { ...item, ...updatedValues } : item)); };
      const removeCartItem = (cartId) => { setCart(currentCart => currentCart.filter(item => item.cartId !== cartId)); };
      const clearCart = () => { if (cart.length > 0) setCart([]); };

      const handleVoiceCommand = useCallback((rawTranscript) => {
        // Map spoken numbers/homophones to actual digits
        const numberMap = {
          'one': '1', 'won': '1',
          'two': '2', 'to': '2', 'too': '2',
          'three': '3',
          'four': '4', 'for': '4',
          'five': '5',
          'six': '6',
          'seven': '7',
          'eight': '8', 'ate': '8',
          'nine': '9',
          'ten': '10'
        };

        const words = (rawTranscript || '').toLowerCase().trim().split(/\s+/);
        const normalizedWords = words.map(w => numberMap[w] || w);
        const transcript = normalizedWords.join(' ');

        setVoiceFeedback(`Heard: "${rawTranscript}"${(rawTranscript || '').toLowerCase() !== transcript ? ` (Parsed: "${transcript}")` : ''}`);

        const findBestProductMatch = (query) => {
          const cleanQuery = query.toLowerCase().trim();
          if (!cleanQuery) return null;

          // 1. Exact name match
          let best = products.find(p => (p.name || '').toLowerCase() === cleanQuery);
          if (best) return best;

          // 2. Exact barcode match
          best = products.find(p => p.barcode && (p.barcode || '').toLowerCase() === cleanQuery);
          if (best) return best;

          // 3. Starts with match
          best = products.find(p => (p.name || '').toLowerCase().startsWith(cleanQuery));
          if (best) return best;

          // 4. Includes match
          best = products.find(p => (p.name || '').toLowerCase().includes(cleanQuery));
          if (best) return best;

          // 5. Keyword similarity match
          const queryWords = cleanQuery.split(/\s+/).filter(w => w.length > 1);
          if (queryWords.length > 0) {
            let highestScore = 0;
            let bestMatch = null;
            products.forEach(p => {
              const prodNameLower = (p.name || '').toLowerCase();
              let score = 0;
              queryWords.forEach(qw => {
                if (prodNameLower.includes(qw)) {
                  score += qw.length;
                }
              });
              if (score > highestScore) {
                highestScore = score;
                bestMatch = p;
              }
            });
            if (bestMatch && highestScore >= Math.min(...queryWords.map(w => w.length))) {
              return bestMatch;
            }
          }
          return null;
        };

        if (transcript === 'clear cart' || transcript === 'clear') {
          clearCart();
          speak('Cart cleared');
          setVoiceFeedback('Cart cleared');
          return;
        }

        if (transcript.startsWith('checkout') || transcript === 'check out') {
          let method = 'Cash';
          if (transcript.includes('card')) method = 'Card';
          else if (transcript.includes('mpesa')) method = 'Mpesa';
          else if (transcript.includes('mobile')) method = 'Mpesa';
          
          setIsCheckingOut(true);
          speak(`Checking out with ${method}`);
          setVoiceFeedback(`Checkout opened (${method})`);
          return;
        }

        if (transcript.startsWith('search ')) {
          const query = transcript.substring(7).trim();
          setSearch(query);
          speak(`Searching for ${query}`);
          setVoiceFeedback(`Searching: ${query}`);
          return;
        }

        if (transcript.startsWith('add ')) {
          let commandBody = transcript.substring(4).trim();
          
          let target = 'cart';
          // Account for "to" -> "2" normalization in speech recognition
          if (/(?:2|to)\s+(?:the\s+)?stock$/.test(commandBody)) {
            target = 'stock';
            commandBody = commandBody.replace(/\s+(?:2|to)\s+(?:the\s+)?stock$/, '').trim();
          } else if (/(?:2|to)\s+(?:the\s+)?cart$/.test(commandBody)) {
            target = 'cart';
            commandBody = commandBody.replace(/\s+(?:2|to)\s+(?:the\s+)?cart$/, '').trim();
          }

          const qtyMatch = commandBody.match(/^(\d+)\s+(.+)$/);
          let quantity = 1;
          let productNameQuery = commandBody;
          if (qtyMatch) {
            quantity = parseInt(qtyMatch[1], 10);
            productNameQuery = qtyMatch[2].trim();
          }

          let matchedProduct = findBestProductMatch(productNameQuery);

          if (matchedProduct) {
            if (target === 'stock') {
              addStock(matchedProduct, quantity);
              speak(`Restocked ${quantity} ${matchedProduct.name}`);
              setVoiceFeedback(`Restocked ${quantity} x ${matchedProduct.name}`);
              return;
            }

            if (matchedProduct.stock <= 0) {
              toast.error(`${matchedProduct.name} is out of stock.`);
              speak(`${matchedProduct.name} is out of stock`);
              setVoiceFeedback(`${matchedProduct.name} is out of stock`);
              return;
            }

            setCart(currentCart => {
              const totalInCart = currentCart.reduce((sum, item) => item.productId === matchedProduct.id ? sum + item.quantity : sum, 0);

              if (totalInCart + quantity > matchedProduct.stock) {
                const available = matchedProduct.stock - totalInCart;
                if (available <= 0) {
                  toast.error(`Not enough stock for ${matchedProduct.name}. Already in cart.`);
                  speak(`No more stock for ${matchedProduct.name}`);
                  return currentCart;
                }
                toast.error(`Only ${matchedProduct.stock} left for ${matchedProduct.name}. Adding ${available}.`);
                speak(`Adding ${available} ${matchedProduct.name}`);
                
                const lastItemIndex = currentCart.length - 1;
                const lastItem = currentCart[lastItemIndex];
                if (lastItem && lastItem.productId === matchedProduct.id) {
                  const newCart = [...currentCart];
                  newCart[lastItemIndex] = { ...lastItem, quantity: lastItem.quantity + available };
                  return newCart;
                } else {
                  return [...currentCart, {
                    cartId: crypto.randomUUID(),
                    productId: matchedProduct.id,
                    name: matchedProduct.name,
                    price: matchedProduct.price,
                    cost: matchedProduct.cost,
                    isCommodity: matchedProduct.isCommodity,
                    unit: matchedProduct.unit,
                    quantity: available,
                    discountType: 'amount',
                    discountValue: 0
                  }];
                }
              }

              const lastItemIndex = currentCart.length - 1;
              const lastItem = currentCart[lastItemIndex];

              if (lastItem && lastItem.productId === matchedProduct.id) {
                const newCart = [...currentCart];
                newCart[lastItemIndex] = { ...lastItem, quantity: lastItem.quantity + quantity };
                toast.success(`${matchedProduct.name} quantity updated in cart`);
                speak(`Added ${quantity} ${matchedProduct.name}`);
                return newCart;
              } else {
                toast.success(`${matchedProduct.name} added to cart`);
                speak(`Added ${quantity} ${matchedProduct.name}`);
                return [...currentCart, {
                  cartId: crypto.randomUUID(),
                  productId: matchedProduct.id,
                  name: matchedProduct.name,
                  price: matchedProduct.price,
                  cost: matchedProduct.cost,
                  isCommodity: matchedProduct.isCommodity,
                  unit: matchedProduct.unit,
                  quantity: quantity,
                  discountType: 'amount',
                  discountValue: 0
                }];
              }
            });
            setVoiceFeedback(`Added ${quantity} x ${matchedProduct.name}`);
          } else {
            toast.error(`Could not find product "${productNameQuery}"`);
            speak(`Product not found`);
            setVoiceFeedback(`Not found: "${productNameQuery}"`);
          }
          return;
        }

        if (transcript.startsWith('remove ')) {
          const productNameQuery = transcript.substring(7).trim();
          const cartItem = cart.find(item => (item.name || '').toLowerCase().includes(productNameQuery));
          if (cartItem) {
            removeCartItem(cartItem.cartId);
            speak(`Removed ${cartItem.name}`);
            setVoiceFeedback(`Removed: ${cartItem.name}`);
          } else {
            toast.error(`No item named "${productNameQuery}" in cart`);
            speak(`Not in cart`);
            setVoiceFeedback(`Not in cart: "${productNameQuery}"`);
          }
          return;
        }

        if (transcript.startsWith('restock ') || transcript.startsWith('stock ')) {
          let prefixLength = transcript.startsWith('restock ') ? 8 : 6;
          let commandBody = transcript.substring(prefixLength).trim();
          const qtyMatch = commandBody.match(/^(\d+)\s+(.+)$/);
          let quantity = 1;
          let productNameQuery = commandBody;
          if (qtyMatch) {
            quantity = parseInt(qtyMatch[1], 10);
            productNameQuery = qtyMatch[2].trim();
          }

          let matchedProduct = findBestProductMatch(productNameQuery);

          if (matchedProduct) {
            addStock(matchedProduct, quantity);
            speak(`Restocked ${quantity} ${matchedProduct.name}`);
            setVoiceFeedback(`Restocked ${quantity} x ${matchedProduct.name}`);
          } else {
            toast.error(`Could not find product "${productNameQuery}" to restock`);
            speak(`Product not found`);
            setVoiceFeedback(`Not found: "${productNameQuery}"`);
          }
          return;
        }

        setVoiceFeedback(`Unknown command: "${transcript}"`);
        speak("Command not recognized");
      }, [products, cart, speak, addStock]);

      const toggleVoiceAssistant = () => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
          toast.error("Web Speech API is not supported in this browser.");
          return;
        }

        if (isListening) {
          if (recognitionRef.current) {
            recognitionRef.current.stop();
          }
          setIsListening(false);
          setVoiceFeedback('');
          return;
        }

        const recognition = new SpeechRecognition();
        recognitionRef.current = recognition;
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        recognition.onstart = () => {
          setIsListening(true);
          setVoiceError('');
          setVoiceFeedback('Listening...');
        };

        recognition.onerror = (event) => {
          console.error(event);
          setVoiceError(`Error: ${event.error}`);
          setIsListening(false);
          speak("Voice error");
        };

        recognition.onend = () => {
          setIsListening(false);
        };

        recognition.onresult = (event) => {
          const resultText = event.results[0][0].transcript;
          handleVoiceCommand(resultText);
        };

        recognition.start();
      };

      useEffect(() => {
        return () => {
          if (recognitionRef.current) {
            recognitionRef.current.stop();
          }
        };
      }, []);
      const canViewCosts = settings.showCosts && (role === 'owner' || !!perms?.viewCostPrice);
      const [viewStock, setViewStock] = useState(false); const [stockSearch, setStockSearch] = useState(''); const [stockDateRange, setStockDateRange] = useState({ start: '', end: '' });
      const [currentPage, setCurrentPage] = useState(1);
      const [prodTab, setProdTab] = useState('manage');
      const [selectedIds, setSelectedIds] = useState(new Set());
      const barcodeBuffer = useRef({ text: '', lastTime: 0 });
      const lastScanTime = useRef(0);
      
      useEffect(() => { setCurrentPage(1); }, [search, cat, activeTab]);

      const filteredStock = useMemo(() => {
        const filterByDate = (items, range) => {
          if (!range.start && !range.end) return items;
          const start = range.start ? new Date(range.start) : null;
          if (start) start.setHours(0, 0, 0, 0);
          const end = range.end ? new Date(range.end) : null;
          if (end) end.setHours(23, 59, 59, 999);
          return items.filter(item => {
            const itemDate = new Date(item.date);
            return (!start || itemDate >= start) && (!end || itemDate <= end);
          });
        };
        return filterByDate([...(stockHistory || [])], stockDateRange).reverse().filter(s => (s.name || '').toLowerCase().includes(stockSearch.toLowerCase()));
      }, [stockHistory, stockDateRange, stockSearch]);

      useEffect(() => {
        if (!showAttractMode) return;
        const handleAnyAction = () => setShowAttractMode(false);
        window.addEventListener('keydown', handleAnyAction);
        window.addEventListener('click', handleAnyAction);
        window.addEventListener('touchstart', handleAnyAction);
        return () => {
          window.removeEventListener('keydown', handleAnyAction);
          window.removeEventListener('click', handleAnyAction);
          window.removeEventListener('touchstart', handleAnyAction);
        };
      }, [showAttractMode]);
      const addProd = () => { if (!form.name || !form.price || !form.stock) return toast.error('Missing fields'); if (form.code && products.some(p => p.barcode === form.code && (p && p.id) !== editId)) return toast.error('Barcode exists'); const newProd = { id: crypto.randomUUID(), name: form.name, category: form.cat || 'General', price: parseFloat(form.price), cost: parseFloat(form.cost) || 0, stock: parseFloat(form.stock), barcode: form.code, sold: 0, profit: 0, dateAdded: new Date().toISOString(), isCommodity: form.isCommodity, unit: form.isCommodity ? form.unit : undefined, expiryDate: form.expiryDate , cashierName: currentUser?.name || 'Unknown', timestamp: new Date().toISOString()}; setProducts([...products, newProd]); toast.success('Added'); setForm({ name: '', price: '', cost: '', stock: '', cat: '', code: '', isCommodity: false, unit: 'Kg', expiryDate: '' }); };

      const addToCart = (product) => {
        if (product.stock <= 0) { return toast.error(`${product.name} is out of stock.`); }

        setCart(currentCart => {
          // Calculate total quantity of this product currently in cart
          const totalInCart = currentCart.reduce((sum, item) => item.productId === product.id ? sum + item.quantity : sum, 0);

          if (totalInCart + 1 > product.stock) {
            toast.error(`Not enough stock for ${product.name}. Only ${product.stock} left.`);
            return currentCart;
          }

          const lastItemIndex = currentCart.length - 1;
          const lastItem = currentCart[lastItemIndex];

          // Check if the last item added is the same product
          if (lastItem && lastItem.productId === product.id) {
            const newCart = [...currentCart];
            newCart[lastItemIndex] = { ...lastItem, quantity: lastItem.quantity + 1 };
            toast.success(`${product.name} quantity updated in cart`);
            return newCart;
          } else {
            // Add as new line item
            toast.success(`${product.name} added to cart`);
            return [...currentCart, {
              cartId: crypto.randomUUID(),
              productId: product.id,
              name: product.name,
              price: product.price,
              cost: product.cost,
              isCommodity: product.isCommodity,
              unit: product.unit,
              quantity: 1,
              discountType: 'amount',
              discountValue: 0
            }];
          }
        });
      };


      const handleCheckout = (saleDetails) => {
        processSale(saleDetails);
      };
      function addStock(p, q) { const updated = products.map(x => x.id === (p && p.id) ? { ...x, stock: x.stock + q } : x); setProducts(updated); setStockHistory([...stockHistory, { name: p.name, qty: q, action: 'Added', barcode: p.barcode, date: new Date().toISOString(), cashierName: currentUser?.name }]); toast.success(`+${q} Stock: ${p.name}`, { duration: 1500 }); };
      const handleScan = (code) => { const p = products.find(x => x.barcode === code); if (scannerMode === 'sell') { if (!p) { toast.error('Product not found', { duration: 1500 }); return; } addToCart(p); setScannerMode(null); return; } if (scannerMode === 'stock') { if (!p) { toast.error('Product not found', { duration: 1500 }); return; } setScannerMode(null); const q = prompt(`Add Stock for "${p.name}":`, '1'); if (q !== null) { const n = parseFloat(q); if (!isNaN(n) && n > 0) addStock(p, n); else toast.error('Invalid quantity'); } return; } setScannerMode(null); if (scannerMode === 'fill') { if (editId) setEditData({ ...editData, barcode: code }); else setForm({ ...form, code }); toast.success('Barcode scanned'); } else if (scannerMode === 'update') { if (products.some(x => x.barcode === code && x.id !== updateId)) { toast.error('Barcode is already taken'); } else { setProducts(products.map(x => x.id === updateId ? { ...x, barcode: code } : x)); toast.success('Barcode updated'); } setUpdateId(null); } };

      const cats = useMemo(() => [...new Set(products.map(p => (p && p.category)))].filter(Boolean).sort((a, b) => a.localeCompare(b)), [products]);
      const filtered = useMemo(() => {
  let res = products.filter(p => ((p.name || '').toLowerCase().includes(search.toLowerCase()) || (p.barcode && p.barcode.includes(search))) && (cat ? (p && p.category) === cat : true));
  if (activeTab === 'expiring') {
    const today = new Date();
    const nextWeek = new Date();
    nextWeek.setDate(today.getDate() + 7);
    res = res.filter(p => {
      if (!p.expiryDate) return false;
      let d;
      if (p.expiryDate.includes('/')) {
        const parts = p.expiryDate.split('/');
        d = new Date(parts[1], parseInt(parts[0]) - 1, 28);
      } else {
        d = new Date(p.expiryDate);
      }
      return d <= nextWeek && d >= today;
    });
  }
  return res;
}, [products, search, cat, activeTab]);

      const handleCreateOrder = (items) => {
        const perfectSupplier = suppliers.find(s => items.every(item => (s.productIds || []).includes(item.id)));
        setInitialSupplierId(perfectSupplier ? perfectSupplier.id : null);
        setSelectedOrderItems(items);
        setShowOrderModal(true);
      };

      const handleSelect = (id) => { const newSet = new Set(selectedIds); if (newSet.has(id)) { newSet.delete(id); } else { newSet.add(id); } setSelectedIds(newSet); };
      const handleSelectAll = (e) => { if (e.target.checked) { setSelectedIds(new Set(filtered.map(p => (p && p.id)))); } else { setSelectedIds(new Set()); } };

      useEffect(() => {
        const handleGlobalScan = (e) => {
          // Must look for digits on the barcode and typing speed should be very fast (scanner)
          if (/^\d$/.test(e.key)) {
            const now = Date.now();
            // Reset buffer if gap between keystrokes is too long (> 200ms implies human)
            if (now - barcodeBuffer.current.lastTime > 200) {
              barcodeBuffer.current.text = '';
            }
            barcodeBuffer.current.text += e.key;
            barcodeBuffer.current.lastTime = now;
          } else if (e.key === 'Enter') {
            if (barcodeBuffer.current.text.length >= 3) {
              const now = Date.now();
              // Should take 0.5 to 1 second to scan one product (throttle to prevent multi-scan)
              if (now - lastScanTime.current < 800) {
                barcodeBuffer.current.text = '';
                return; // Ignore duplicate scan within 0.8s
              }
              const code = barcodeBuffer.current.text;
              barcodeBuffer.current.text = '';
              const p = products.find(x => x.barcode === code);
              if (p) {
                addToCart(p);
                lastScanTime.current = Date.now();
                e.preventDefault();
              }
            }
          } else if (e.key !== 'Shift') {
            // Any non-digit key resets buffer
            barcodeBuffer.current.text = '';
          }
        };
        window.addEventListener('keydown', handleGlobalScan);
        return () => window.removeEventListener('keydown', handleGlobalScan);
      }, [products, addToCart]); 




      return (<div className="space-y-6 pb-20">
        <div className="flex flex-col sm:flex-row justify-between gap-4">
          <div className="sb-page-title">
            <h2 className="text-2xl font-bold text-slate-800">Products</h2>
            <p className="text-slate-500">Inventory Management & Sales</p>
          </div>
          <div className="flex gap-2 flex-wrap sb-quick-actions">
            {(role === 'owner' || perms.editProducts) && <button onClick={() => setShowAddProduct(v => !v)} className={`btn-primary px-4 py-2 ${showAddProduct ? 'bg-slate-600 hover:bg-slate-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}>{showAddProduct ? <><X className="w-4 h-4" /> Close</> : <><Plus className="w-4 h-4" /> Add New Product</>}</button>}
            <button onClick={(e) => { e.stopPropagation(); setShowAttractMode(true) }} className="btn-primary bg-purple-600 hover:bg-purple-700 px-4 py-2"><Play className="w-4 h-4" /> Attract Mode</button>
            <button onClick={() => setShowImport(true)} className="btn-primary px-4 py-2"><FileText className="w-4 h-4" /> Import List</button>
            {(role === 'owner' || perms.bulkPriceUpdate) && <button onClick={() => setShowBulkPriceUpdate(true)} className="btn-primary bg-blue-600 hover:bg-blue-700 px-4 py-2"><Edit2 className="w-4 h-4" /> Bulk Update</button>}
            {settings.showScan && (<><button onClick={() => setScannerMode('stock')} className="btn-primary px-4 py-2"><PackagePlus className="w-4 h-4" /> Scan to Stock</button>{settings.showScanToSell && <button onClick={() => setScannerMode('sell')} className="btn-primary px-4 py-2"><Scan className="w-4 h-4" /> Scan to Sell</button>}</>)}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {(role === 'owner' || perms.editProducts) && showAddProduct && (<div className="card grid md:grid-cols-2 lg:grid-cols-4 gap-4"><div className="col-span-full font-semibold text-slate-700">Add New Product</div><div className="lg:col-span-2"><input id="field-25" name="field-25" className="input-field" placeholder="Product Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div><div><input id="field-26" name="field-26" className="input-field" type="number" placeholder={form.isCommodity ? `Price per ${form.unit}` : "Price"} value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} /></div>{settings.showCosts && <div><input id="field-27" name="field-27" className="input-field" type="number" placeholder={form.isCommodity ? `Cost per ${form.unit}` : "Cost"} value={form.cost} onChange={e => setForm({ ...form, cost: e.target.value })} /></div>}<div><input id="field-28" name="field-28" className="input-field" type="number" placeholder={form.isCommodity ? `Stock (${form.unit})` : "Stock"} value={form.stock} onChange={e => setForm({ ...form, stock: e.target.value })} /></div>{settings.trackExpiry !== false && <div><label className="text-xs text-slate-500 font-medium block mb-1">Expiry Date</label><input id="field-29" name="field-29" type="month" className="input-field" value={form.expiryDate} onChange={e => setForm({ ...form, expiryDate: e.target.value })} /></div>}<div><input id="field-30" name="field-30" className="input-field" list="category-list" placeholder="Category" value={form.cat} onChange={e => setForm({ ...form, cat: e.target.value })} /><datalist id="category-list">{cats.map(c => <option key={c} value={c} />)}</datalist></div><div className="col-span-full lg:col-span-2"><div className="relative flex-1"><input id="field-31" name="field-31" className="input-field pr-8" placeholder="Barcode (Optional)" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} />{settings.showScan && <button onClick={() => setScannerMode('fill')} className="absolute right-2 top-2.5 text-slate-400 hover:text-emerald-600"><Scan className="w-4 h-4" /></button>}</div></div><div className="col-span-full flex justify-between items-center mt-2"><div className="flex items-center gap-4"><div className="flex items-center gap-2"><input type="checkbox" id="isCommodityAdd" checked={form.isCommodity} onChange={e => setForm({ ...form, isCommodity: e.target.checked })} className="w-4 h-4 text-emerald-600 bg-gray-100 border-gray-300 rounded focus:ring-emerald-500" /><label htmlFor="isCommodityAdd" className="text-sm font-medium text-slate-700">Commodity</label></div>{form.isCommodity && (<select value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} className="input-field py-1 text-sm w-24"><option value="Kg">Kg</option><option value="L">L</option></select>)}</div><button onClick={addProd} className="btn-primary px-6"><Plus className="w-4 h-4" /> Add</button></div></div>)}
            
            {role === 'owner' && <div className="flex gap-4 mb-4 border-b border-slate-200">
              <button onClick={() => setProdTab('manage')} className={`pb-3 px-2 font-semibold text-sm border-b-2 transition-colors ${prodTab === 'manage' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>Manage Products</button>
              <button onClick={() => setProdTab('orders')} className={`pb-3 px-2 font-semibold text-sm border-b-2 transition-colors ${prodTab === 'orders' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>Orders</button>
            </div>}
            
            {prodTab === 'manage' ? (<>
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3 w-full">
              <div className="flex-1 flex flex-col gap-2">
                <div className="relative w-full">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input id="field-32" name="field-32" className="input-field w-full pl-9 pr-10 py-2 text-sm rounded-full" placeholder="Search products..." value={search} onChange={e => setSearch(e.target.value)} />
                  <button 
                    onClick={toggleVoiceAssistant} 
                    className={`absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-full transition-all ${isListening ? 'bg-red-500 text-white animate-pulse' : 'text-slate-400 hover:text-emerald-600 hover:bg-slate-100'}`}
                    title="Voice Assistant (e.g., 'add 2 milk', 'clear cart', 'checkout cash')"
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                </div>
                {(voiceFeedback || voiceError || isListening) && (
                  <div className={`text-xs px-3 py-1.5 rounded-lg flex items-center justify-between transition-all ${voiceError ? 'bg-red-50 text-red-600 border border-red-100' : isListening ? 'bg-blue-50 text-blue-600 border border-blue-100 animate-pulse' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'}`}>
                    <span className="font-medium flex items-center gap-1.5">
                      <span className={`w-2.5 h-2.5 rounded-full ${voiceError ? 'bg-red-500' : isListening ? 'bg-blue-500 animate-ping' : 'bg-emerald-500'}`}></span>
                      {isListening ? 'Listening... Speak (e.g. "add 2 milk", "clear cart", "checkout cash")' : voiceFeedback || voiceError}
                    </span>
                    <button onClick={() => { setVoiceFeedback(''); setVoiceError(''); }} className="text-slate-400 hover:text-slate-600">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
              <div className="flex-1 flex gap-2 items-center">
                <select className="input-field flex-1" value={cat} onChange={e => setCat(e.target.value)}><option value="">All Categories</option>{cats.map(c => <option key={c} value={c}>{c}</option>)}</select>
                {cat && (role === 'owner' || perms.editProducts) && (
                  <button onClick={() => {
                    const newCat = prompt('Rename Category:', cat);
                    if (newCat && newCat.trim() && newCat !== cat) {
                      setProducts(products.map(p => (p && p.category) === cat ? { ...p, category: newCat.trim() } : p));
                      setCat(newCat.trim());
                      toast.success('Category renamed');
                    }
                  }} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600" title="Rename Category">
                    <Edit2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              {role === 'owner' && selectedIds.size > 0 && <button onClick={() => handleCreateOrder(products.filter(p => selectedIds.has((p && p.id))))} className="btn-primary bg-blue-600 hover:bg-blue-700 py-2 px-4 whitespace-nowrap"><Truck className="w-4 h-4" /> Order ({selectedIds.size})</button>}
              {role === 'owner' && selectedIds.size > 0 && <button onClick={() => { setShowShoppingListModal(true); setShoppingListItems(products.filter(p => selectedIds.has((p && p.id))).map(p => ({ ...p, qty: 1 }))); }} className="btn-primary bg-emerald-600 hover:bg-emerald-700 py-2 px-4 whitespace-nowrap"><ClipboardList className="w-4 h-4" /> Create shopping list</button>}
            </div>
            <div>{role === 'owner' && filtered.length > 0 && (<div className="flex items-center gap-2 mb-3 px-1"><input id="field-33" name="field-33" type="checkbox" onChange={handleSelectAll} checked={selectedIds.size === filtered.length && filtered.length > 0} className="w-4 h-4 text-emerald-600 bg-gray-100 border-gray-300 rounded focus:ring-emerald-500" /><span className="text-xs text-slate-500 font-medium">Select all ({filtered.length})</span></div>)}<div className="grid grid-cols-1 md:grid-cols-2 gap-3"><ErrorBoundary>{filtered.slice((currentPage - 1) * 50, currentPage * 50).map(p => { const safePrice = Number(p.price) || 0; const safeCost = Number(p.cost) || 0; const safeStock = Number(p.stock) || 0; const isEdit = editId === (p && p.id); if (isEdit) { return (<div key={(p && p.id)} className="bg-white rounded-2xl border-2 border-emerald-300 shadow-sm p-4 md:col-span-2"><div className="grid grid-cols-1 md:grid-cols-2 gap-3"><input id="field-34" name="field-34" className="input-field py-2 text-sm" placeholder="Name" value={editData.name} onChange={e => setEditData({ ...editData, name: e.target.value })} /><input id="field-35" name="field-35" className="input-field py-2 text-xs font-mono" placeholder="Barcode" value={editData.barcode || ''} onChange={e => setEditData({ ...editData, barcode: e.target.value })} />{(role === 'owner' || perms.editPriceAndCost) ? <input id="field-36" name="field-36" type="number" className="input-field py-2" placeholder="Price" value={editData.price ?? ''} onChange={e => setEditData({ ...editData, price: parseFloat(e.target.value) })} /> : <div className="py-2 text-slate-600">Ksh. {(Number(editData.price) || 0).toLocaleString()}</div>}{canViewCosts && ((role === 'owner' || perms.editPriceAndCost) ? <input id="field-37" name="field-37" type="number" className="input-field py-2" placeholder="Cost" value={editData.cost ?? ''} onChange={e => setEditData({ ...editData, cost: parseFloat(e.target.value) })} /> : <div className="py-2 text-slate-500">Cost: Ksh. {(Number(editData.cost) || 0).toLocaleString()}</div>)}<input id="field-38" name="field-38" type="number" className="input-field py-2" placeholder="Stock" value={editData.stock ?? ''} onChange={e => setEditData({ ...editData, stock: parseFloat(e.target.value) })} /><input id="field-39" name="field-39" className="input-field py-2" placeholder="Category" value={editData.category || ''} onChange={e => setEditData({ ...editData, category: e.target.value })} />{settings.trackExpiry !== false && <input id="field-40" name="field-40" type="month" className="input-field py-2" value={editData.expiryDate || ''} onChange={e => setEditData({ ...editData, expiryDate: e.target.value })} />}<div className="flex items-center gap-2"><input type="checkbox" id={`commodity-edit-${(p && p.id)}`} checked={!!editData.isCommodity} onChange={e => setEditData({ ...editData, isCommodity: e.target.checked })} className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500" /><label htmlFor={`commodity-edit-${(p && p.id)}`} className="text-xs font-medium">Commodity</label>{!!editData.isCommodity && (<select value={editData.unit || 'Kg'} onChange={e => setEditData({ ...editData, unit: e.target.value })} className="input-field py-1 text-xs w-20"><option value="Kg">Kg</option><option value="L">L</option></select>)}</div></div><div className="flex justify-end gap-2 mt-3"><button onClick={() => setEditId(null)} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 text-sm font-medium flex items-center gap-1"><X className="w-4 h-4" /> Cancel</button><button onClick={() => { const updated = products.map(x => x.id === editId ? { ...x, ...editData, unit: editData.isCommodity ? (editData.unit || 'Kg') : undefined } : x); setProducts(updated); toast.success('Updated'); setEditId(null); }} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium flex items-center gap-1"><Check className="w-4 h-4" /> Save</button></div></div>); } return (<div key={(p && p.id)} className={`bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow p-4 flex ${p.expiryDate ? 'ring-1 ring-amber-100' : ''}`}><div className="w-2/5 flex flex-col justify-between pr-4 border-r border-dashed border-slate-200"><div>{role === 'owner' ? (<input id="field-41" name="field-41" type="checkbox" checked={selectedIds.has((p && p.id))} onChange={() => handleSelect((p && p.id))} className="w-5 h-5 text-emerald-600 bg-white border-slate-300 rounded-md focus:ring-emerald-500" />) : <div className="h-5"/>}</div><div className="flex-1 flex items-center"><div className="text-xl md:text-2xl font-extrabold text-emerald-600 leading-tight">Ksh. {safePrice.toLocaleString()}{p.isCommodity ? <span className="text-sm font-semibold">/{p.unit}</span> : ''}</div></div><div className="flex items-center gap-2"><span className={`px-3 py-1 rounded-full text-xs font-bold ${safeStock <= 5 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>{safeStock} {p.isCommodity ? p.unit : 'left'}</span>{(role === 'owner' || perms.addStock) && <button onClick={() => { const q = prompt('Add Stock:'); if (q) addStock(p, parseFloat(q)) }} className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg" title="Add Stock"><Plus className="w-4 h-4 text-slate-700" /></button>}</div></div><div className="w-3/5 pl-4 flex flex-col">{settings.trackExpiry !== false && p.expiryDate && (<div className="self-start mb-2"><span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-50 text-amber-700 text-xs font-bold border border-amber-100"><Calendar className="w-3 h-3" /> Exp: {p.expiryDate}</span></div>)}<div className="text-base md:text-lg font-bold text-slate-900 leading-tight">{p.name}</div>{canViewCosts && <div className="text-sm text-slate-500 mt-1">Ksh. {safeCost.toLocaleString()}{p.isCommodity ? `/${p.unit}` : ''}</div>}{(p && p.category) && <div className="text-sm text-slate-500 mt-1">{(p && p.category)}</div>}{p.barcode && <div className="text-[10px] text-slate-400 font-mono mt-1 truncate">{p.barcode}</div>}<div className="border-t border-slate-100 mt-auto pt-3 flex gap-1.5 flex-wrap"><button onClick={() => addToCart(p)} className="p-2 bg-emerald-50 hover:bg-emerald-100 rounded-lg" title="Add to Cart"><ShoppingCart className="w-4 h-4 text-emerald-600" /></button>{(role === 'owner' || perms.addStock) && <button onClick={() => { const q = prompt('Add Stock:'); if (q) addStock(p, parseFloat(q)) }} className="p-2 bg-blue-50 hover:bg-blue-100 rounded-lg" title="Add Stock"><PackagePlus className="w-4 h-4 text-blue-600" /></button>}{settings.showScan && (role === 'owner' || perms.editProducts) && <button onClick={() => { setUpdateId((p && p.id)); setScannerMode('update'); }} className="p-2 bg-indigo-50 hover:bg-indigo-100 rounded-lg" title="Update Barcode"><QrCode className="w-4 h-4 text-indigo-600" /></button>}{(role === 'owner' || perms.editProducts) && <button onClick={() => { setEditId((p && p.id)); setEditData({ ...p }) }} className="p-2 bg-amber-50 hover:bg-amber-100 rounded-lg" title="Edit"><Edit2 className="w-4 h-4 text-amber-600" /></button>}{(role === 'owner' || perms.editProducts) && <button onClick={() => { if (confirm('Delete?')) setProducts(products.filter(x => x.id !== (p && p.id))) }} className="p-2 bg-red-50 hover:bg-red-100 rounded-lg" title="Delete"><Trash2 className="w-4 h-4 text-red-500" /></button>}</div></div></div>); })}</ErrorBoundary>{filtered.length === 0 && <div className="md:col-span-2 p-8 text-center text-slate-400 bg-white rounded-xl border border-slate-200">No products found.</div>}</div><Pagination totalItems={filtered.length} itemsPerPage={50} currentPage={currentPage} setCurrentPage={setCurrentPage} /></div></>) : <div className="bg-white rounded-2xl p-6 border border-slate-200">Orders content placeholder</div>}
          </div>
          <div className="lg:col-span-1 sticky top-8 order-1 lg:order-2"><CartPanel cart={cart} onUpdate={updateCartItem} onRemove={removeCartItem} onClear={clearCart} onCheckout={() => setIsCheckingOut(true)} currentUser={currentUser} /></div>
        </div>

        {scannerMode && <ScannerModal title={scannerMode === 'sell' ? 'Scan to Sell' : scannerMode === 'stock' ? 'Scan to Stock' : 'Scan Barcode'} onScan={handleScan} onClose={() => setScannerMode(null)} scannerSize={superAdminSettings?.scannerSize} />}
        {showImport && <TextImportModal existingProducts={products} onClose={() => setShowImport(false)} onImport={(items) => setProducts([...products, ...items])} settings={settings} />}
        {showBulkPriceUpdate && <BulkPriceUpdateModal products={products} setProducts={setProducts} onClose={() => setShowBulkPriceUpdate(false)} currentUser={currentUser} suppliers={suppliers} />}
        {isCheckingOut && <CheckoutModal cart={cart} onConfirm={handleCheckout} onClose={() => { setIsCheckingOut(false); clearCart(); }} currentUser={currentUser} printData={printData} settings={settings} customers={customers} updateCustomers={updateCustomers} />}
        {showOrderModal && <OrderModal initialProducts={selectedOrderItems} suppliers={suppliers} shopName={settings.name} onClose={() => { setShowOrderModal(false); setSelectedIds(new Set()); }} initialSupplierId={initialSupplierId} />}
        {showAttractMode && <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center cursor-pointer" onClick={(e) => { e.stopPropagation(); setShowAttractMode(false); }}><video src="animation.mp4" autoPlay loop muted playsInline className="w-full h-full object-cover" /></div>}
        
        {printShoppingListNow && createPortal(
          <div style={{ fontFamily: 'monospace', fontSize: settings.receiptBodyFontSize || '10pt', color: '#000', width: '280px', padding: '5px' }}>
            <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: settings.receiptTitleFontSize || '12pt' }}>{settings.name}</div>
            <div style={{ textAlign: 'center' }}>SHOPPING LIST</div>
            <div style={{ height: '10px' }}></div>
            <div>Date: {new Date().toLocaleDateString('en-GB')} {new Date().toLocaleTimeString()}</div>
            <div style={{ borderTop: '1px dashed #000', margin: '5px 0' }}></div>
            <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 1.5fr', fontWeight: 'bold', gap: '4px' }}>
              <span>Item</span>
              <span style={{ textAlign: 'center' }}>Qty</span>
              <span style={{ textAlign: 'right' }}>Total</span>
            </div>
            <div style={{ borderTop: '1px dashed #000', margin: '5px 0' }}></div>
            {shoppingListItems.map((item, index) => (
              <div key={index} style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 1.5fr', gap: '4px' }}>
                <span>{item.name}</span>
                <span style={{ textAlign: 'center' }}>{item.qty}</span>
                <span style={{ textAlign: 'right' }}>{(Number(item.cost || 0) * item.qty).toLocaleString()}</span>
              </div>
            ))}
            <div style={{ borderTop: '1px dashed #000', margin: '5px 0' }}></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
              <span>GRAND TOTAL:</span>
              <span>{shoppingListItems.reduce((acc, item) => acc + (Number(item.cost || 0) * item.qty), 0).toLocaleString()}</span>
            </div>
            <div style={{ borderTop: '1px dashed #000', margin: '5px 0' }}></div>
          </div>,
          document.getElementById('print-area')
        )}
        {showShoppingListModal && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl relative flex flex-col max-h-[90vh]">
              <div className="p-4 border-b flex justify-between items-center bg-slate-50 rounded-t-2xl">
                <h3 className="font-bold text-slate-800 flex items-center gap-2"><ClipboardList className="w-5 h-5 text-emerald-600" /> Shopping List</h3>
                <button onClick={() => setShowShoppingListModal(false)}><X className="w-5 h-5 text-slate-500 hover:text-slate-800" /></button>
              </div>
              <div className="overflow-y-auto p-4 flex-1">
                <table className="w-full text-sm text-left border">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="p-3">Product</th>
                      <th className="p-3 text-right">Cost Price (Ksh)</th>
                      <th className="p-3 text-center">Quantity</th>
                      <th className="p-3 text-right">Total Cost (Ksh)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shoppingListItems.map((item, idx) => (
                      <tr key={item.id} className="border-b">
                        <td className="p-3 font-medium text-slate-800">{item.name}</td>
                        <td className="p-3 text-right text-slate-600">{Number(item.cost || 0).toLocaleString()}</td>
                        <td className="p-3 text-center">
                          <input id="field-42" name="field-42" type="number" min="1" value={item.qty} onChange={(e) => {
                            const newQty = parseInt(e.target.value) || 1;
                            const newItems = [...shoppingListItems];
                            newItems[idx].qty = newQty;
                            setShoppingListItems(newItems);
                          }} className="w-20 p-2 border rounded-lg text-center mx-auto" />
                        </td>
                        <td className="p-3 text-right font-bold text-emerald-600">{(Number(item.cost || 0) * item.qty).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-emerald-50">
                      <td colSpan="3" className="p-3 text-right font-bold text-slate-700">Grand Total:</td>
                      <td className="p-3 text-right font-bold text-emerald-700">
                        {shoppingListItems.reduce((acc, item) => acc + (Number(item.cost || 0) * item.qty), 0).toLocaleString()}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <div className="p-4 border-t bg-slate-50 flex justify-end gap-3 rounded-b-2xl">
                <button onClick={() => setShowShoppingListModal(false)} className="px-4 py-2 text-slate-600 bg-slate-200 rounded-lg font-medium">Close</button>
                <button onClick={() => {
                  setPrintShoppingListNow(true);
                  setTimeout(() => {
                    window.print();
                    setPrintShoppingListNow(false);
                  }, 100);
                }} className="px-4 py-2 text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg font-bold flex items-center gap-2">
                  <Printer className="w-4 h-4" /> Print Receipt
                </button>
              </div>
            </div>
          </div>
        )}

</div>);
    };

    const StockHistoryPanel = ({ stockHistory }) => {
      const [searchVal, setSearchVal] = useState('');
      const [dateRange, setDateRange] = useState({ start: '', end: '' });
      const [currentPage, setCurrentPage] = useState(1);
      
      useEffect(() => { setCurrentPage(1); }, [searchVal, dateRange]);

      const filteredStock = useMemo(() => {
        return stockHistory.filter(s => {
          const matchSearch = (s.name || '').toLowerCase().includes(searchVal.toLowerCase()) || s.cashierName?.toLowerCase().includes(searchVal.toLowerCase());
          const dDate = new Date(s.date).toISOString().split('T')[0];
          const matchStart = !dateRange.start || dDate >= dateRange.start;
          const matchEnd = !dateRange.end || dDate <= dateRange.end;
          return matchSearch && matchStart && matchEnd;
        }).reverse();
      }, [stockHistory, searchVal, dateRange]);

      return (<div className="space-y-6 pb-20">
        <div className="flex flex-col sm:flex-row justify-between gap-4 items-start sm:items-center">
          <div><h2 className="text-2xl font-bold text-slate-800">Stock History</h2><p className="text-slate-500">Track inventory additions</p></div>
          <div className="flex gap-2 flex-wrap">
            <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><input id="field-43" name="field-43" value={searchVal} onChange={e => setSearchVal(e.target.value)} className="input-field py-1.5 pl-9 text-sm" placeholder="Search..." /></div>
            <input id="field-44" name="field-44" type="date" value={dateRange.start} onChange={e => setDateRange({ ...dateRange, start: e.target.value })} className="input-field py-1.5 text-sm" />
            <input id="field-45" name="field-45" type="date" value={dateRange.end} onChange={e => setDateRange({ ...dateRange, end: e.target.value })} className="input-field py-1.5 text-sm" />
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm text-left"><thead className="bg-slate-50 text-slate-500 font-medium"><tr><th className="p-3">Date</th><th className="p-3">Product</th><th className="p-3">Added by</th><th className="p-3 text-right">Qty Added</th></tr></thead><tbody className="divide-y divide-slate-100">{filteredStock.slice((currentPage - 1) * 50, currentPage * 50).map((s, i) => <tr key={i} className="hover:bg-slate-50"><td className="p-3 text-slate-500">{new Date(s.date).toLocaleString()}</td><td className="p-3 font-medium text-slate-800">{s.name}</td><td className="p-3 text-slate-500">{s.cashierName}</td><td className="p-3 text-right font-bold text-blue-600">+{s.qty}</td></tr>)}</tbody></table>
          <Pagination totalItems={filteredStock.length} itemsPerPage={50} currentPage={currentPage} setCurrentPage={setCurrentPage} />
        </div>
      </div>);
    };

    const DebtPanel = ({ debts, setDebts, paidDebts, setPaidDebts, settings, products, setProducts, salesHistory, setSalesHistory, currentUser }) => {
      const [viewHistory, setViewHistory] = useState(false); 
      const [form, setForm] = useState({ name: '', phone: '', item: '', amount: '' }); 
      const [productSearch, setProductSearch] = useState('');
      const [debtCart, setDebtCart] = useState([]);
      const [currentPage, setCurrentPage] = useState(1);
      
      useEffect(() => { setCurrentPage(1); }, [viewHistory]);

      useEffect(() => {
        if (debtCart.length > 0) {
          const total = debtCart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
          setForm(f => ({ ...f, amount: total.toString(), item: '' }));
        }
      }, [debtCart]);

      const add = () => { 
        if (!form.name || !form.amount) return toast.error('Name & Amount required'); 
        
        let tempProducts = [...products];
        for (const item of debtCart) {
          const pIndex = tempProducts.findIndex(p => (p && p.id) === item.id);
          if (pIndex === -1) return toast.error("Product not found: " + item.name);
          if (tempProducts[pIndex].stock < item.quantity) return toast.error(`Not enough stock for ${item.name}. Need ${item.quantity}, have ${tempProducts[pIndex].stock}`);
          tempProducts[pIndex] = { ...tempProducts[pIndex], stock: tempProducts[pIndex].stock - item.quantity };
        }

        const dId = crypto.randomUUID();
        const d = { 
          id: dId, 
          name: form.name, 
          contact: form.phone, 
          product: debtCart.length > 0 ? debtCart.map(i => `${i.name} (x${i.quantity})`).join(', ') : form.item, 
          cart: debtCart,
          amount: parseFloat(form.amount) || 0, 
          dateAdded: new Date().toISOString().split('T')[0] 
        }; 

        if (debtCart.length > 0) setProducts(tempProducts);
        setDebts([...(debts || []), d]); 

        const newSales = [];
        if (debtCart.length > 0) {
          debtCart.forEach(item => {
            newSales.push({
              id: 'debt_' + dId + '_' + item.id,
              name: item.name,
              productName: item.name,
              customer: d.name,
              quantity: item.quantity,
              price: item.price,
              cost: item.cost,
              finalPrice: item.price * item.quantity,
              profit: (item.price - (item.cost || 0)) * item.quantity,
              date: new Date().toISOString(),
              paymentMethod: 'debt',
              cashierName: currentUser?.name || 'Unknown'
            });
          });
        } else {
          newSales.push({ 
            id: 'debt_' + dId, 
            name: d.product || 'Debt', 
            productName: d.product || '', 
            customer: d.name,
            quantity: 1, 
            price: d.amount, 
            cost: d.amount,
            finalPrice: d.amount, 
            profit: d.amount, 
            date: new Date().toISOString(), 
            paymentMethod: 'debt', 
            cashierName: currentUser?.name || 'Unknown' 
          });
        }
        
        setSalesHistory([...(salesHistory || []), ...newSales]); 
        setForm({ name: '', phone: '', item: '', amount: '' }); 
        setDebtCart([]);
        toast.success('Debt recorded'); 
      };

      const remind = (d) => { 
        if (!d.contact) return toast.error('No phone number'); 
        const msg = `Hello ${d.name}, reminder from ${settings.name}: Pending balance Ksh. ${d.amount} for ${d.product || 'items'} taken on ${new Date(d.dateAdded || new Date()).toLocaleDateString()}.`; 
        window.open(`https://wa.me/${d.contact.replace(/\D/g, '').replace(/^0/, '254')}?text=${encodeURIComponent(msg)}`, '_blank'); 
      };

      const filteredProducts = useMemo(() => productSearch ? (products || []).filter(p => p.name && typeof p.name === 'string' && (p.name || '').toLowerCase().includes(productSearch.toLowerCase())) : [], [products, productSearch]);

      const handleMarkPaid = (d) => {
        if (confirm('Mark Paid?')) { 
          setPaidDebts([...paidDebts, { ...d, datePaid: new Date().toISOString().split('T')[0] }]); 
          setDebts(debts.filter(x => x.id !== d.id)); 
          
          const updatedSales = (salesHistory || []).map(s => {
            if (s.id.startsWith('debt_' + d.id)) {
              return { ...s, name: s.productName || s.name.replace('Debt: ', ''), paymentMethod: 'cash', date: new Date().toISOString() };
            }
            return s;
          });
          setSalesHistory(updatedSales);
          toast.success('Marked Paid'); 
        }
      };

      return (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div><h2 className="text-2xl font-bold text-slate-800">Debts</h2><p className="text-slate-500">Track pending payments</p></div>
            <button onClick={() => setViewHistory(!viewHistory)} className="text-emerald-600 font-medium hover:underline">{viewHistory ? 'View Active Debts' : 'View Paid History'}</button>
          </div>
          {!viewHistory && (
            <div className="card grid md:grid-cols-5 gap-3 bg-white">
              <input id="field-46" name="field-46" className="input-field" placeholder="Customer Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              <input id="field-47" name="field-47" className="input-field" placeholder="Phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
              <div className="relative">
                <input id="field-48" name="field-48" className="input-field" placeholder={debtCart.length > 0 ? "Add another product..." : "Items"} value={form.item} onChange={e => setForm({ ...form, item: e.target.value })} />
                <input id="field-49" name="field-49" className="input-field mt-1 text-xs" placeholder="Search product..." value={productSearch} onChange={e => setProductSearch(e.target.value)} />
                {filteredProducts.length > 0 && (
                  <div className="absolute z-10 w-full bg-white border rounded-lg mt-1 max-h-40 overflow-auto shadow-lg">
                    {filteredProducts.map(p => (
                      <div key={(p && p.id)} onClick={() => { 
                        const qtyStr = prompt(`Enter quantity for ${p.name}`, '1');
                        if (qtyStr !== null) {
                          const qty = parseInt(qtyStr);
                          if (!isNaN(qty) && qty > 0) {
                            const existing = debtCart.find(item => item.id === (p && p.id));
                            if (existing) {
                              setDebtCart(debtCart.map(item => item.id === (p && p.id) ? { ...item, quantity: item.quantity + qty } : item));
                            } else {
                              setDebtCart([...debtCart, { ...p, quantity: qty }]);
                            }
                          }
                        }
                        setProductSearch(''); 
                      }} className="p-2 hover:bg-emerald-50 cursor-pointer text-sm">
                        {p.name} (Stock: {p.stock})
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <input id="field-50" name="field-50" className="input-field" type="number" placeholder="Amount" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
              <button onClick={add} className="btn-primary">Add Debt</button>
              
              {debtCart.length > 0 && (
                <div className="col-span-full border rounded-lg bg-slate-50 p-3 space-y-2 mt-2">
                  <h4 className="text-xs font-bold text-slate-500 uppercase">Selected Products</h4>
                  {debtCart.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center text-sm bg-white p-2 rounded border">
                      <span className="font-medium text-slate-700">{item.name} <span className="text-slate-400 font-normal">x{item.quantity}</span></span>
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-slate-700">Ksh. {(item.price * item.quantity).toLocaleString()}</span>
                        <button onClick={() => setDebtCart(debtCart.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600 p-1 rounded hover:bg-red-50">âœ•</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 border-b">
                <tr><th className="p-4">Customer</th><th className="p-4">Items</th><th className="p-4">Amount</th><th className="p-4">Date</th><th className="p-4 text-right">Actions</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(viewHistory ? paidDebts : debts).slice((currentPage - 1) * 50, currentPage * 50).map(d => (
                  <tr key={d.id} className="hover:bg-slate-50">
                    <td className="p-4"><div>{d.name}</div><div className="text-xs text-slate-400">{d.contact}</div></td>
                    <td className="p-4 text-slate-500 max-w-xs truncate" title={d.product || '-'}>{d.product || '-'}</td>
                    <td className="p-4 font-bold text-slate-700">Ksh. {Number(d.amount || 0).toLocaleString()}</td>
                    <td className="p-4 text-slate-500">{d.dateAdded || d.datePaid}</td>
                    <td className="p-4 flex justify-end gap-2">
                      {!viewHistory ? (
                        <>
                          <button onClick={() => handleMarkPaid(d)} className="p-2 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100" title="Mark Paid"><CheckCircle className="w-4 h-4" /></button>
                          <button onClick={() => remind(d)} className="p-2 bg-green-50 text-green-600 rounded-lg hover:bg-green-100" title="WhatsApp Reminder"><MessageCircle className="w-4 h-4" /></button>
                        </>
                      ) : <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-xs rounded-full font-bold">PAID</span>}
                      <button onClick={() => { if (confirm('Delete?')) viewHistory ? setPaidDebts(paidDebts.filter(x => x.id !== d.id)) : setDebts(debts.filter(x => x.id !== d.id)) }} className="p-2 text-red-400 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                    </td>
                  </tr>
                ))}
                {(viewHistory ? paidDebts : debts).length === 0 && <tr><td colSpan={5} className="p-8 text-center text-slate-400">No records found.</td></tr>}
              </tbody>
            </table>
            <Pagination totalItems={(viewHistory ? paidDebts : debts).length} itemsPerPage={50} currentPage={currentPage} setCurrentPage={setCurrentPage} />
          </div>
        </div>
      );
    };

    const ExpensePanel = ({ expenses, setExpenses, currentUser }) => {
      const [desc, setDesc] = useState(''); const [amt, setAmt] = useState('');
      const [currentPage, setCurrentPage] = useState(1);
      const add = (quickDesc) => { const d = quickDesc || desc; if (!d || !amt) return toast.error('Required fields'); setExpenses([...expenses, { id: crypto.randomUUID(), desc: d, amount: parseFloat(amt), date: new Date().toISOString().split('T')[0], timestamp: new Date().toISOString(), cashierName: currentUser?.name || 'Unknown' }]); setDesc(''); setAmt(''); toast.success('Expense added'); };
      return (<div className="grid md:grid-cols-3 gap-6"><div className="md:col-span-2 space-y-6"><div><h2 className="text-2xl font-bold text-slate-800">Expenses</h2><p className="text-slate-500">Track shop spending</p></div><div className="card flex flex-col sm:flex-row gap-3 bg-white"><input id="field-51" name="field-51" className="input-field flex-1 w-full min-w-[200px]" placeholder="Description" value={desc} onChange={e => setDesc(e.target.value)} /><input id="field-52" name="field-52" className="input-field w-full sm:w-32" type="number" placeholder="Amount" value={amt} onChange={e => setAmt(e.target.value)} /><button onClick={() => add()} className="btn-primary w-full sm:w-auto px-6">Add</button></div><div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-slate-500 border-b"><tr><th className="p-4">Description</th><th className="p-4">Amount</th><th className="p-4">Date</th><th className="p-4 text-right">Action</th></tr></thead><tbody className="divide-y divide-slate-100">{expenses.slice((currentPage - 1) * 50, currentPage * 50).map(e => (<tr key={e.id}><td className="p-4 text-slate-800">{e.desc}</td><td className="p-4 font-bold text-slate-700">Ksh. {e.amount.toLocaleString()}</td><td className="p-4 text-slate-500">{e.date}</td><td className="p-4 text-right"><button onClick={() => { if (confirm('Delete?')) setExpenses(expenses.filter(x => x.id !== e.id)) }} className="text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button></td></tr>))}{expenses.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-slate-400">No expenses recorded.</td></tr>}</tbody></table><Pagination totalItems={expenses.length} itemsPerPage={50} currentPage={currentPage} setCurrentPage={setCurrentPage} /></div></div><div className="bg-slate-100 rounded-xl p-5 h-fit"><h3 className="font-bold mb-4 flex gap-2 items-center text-slate-700"><Zap className="w-4 h-4 text-amber-500" /> Quick Add</h3><div className="grid grid-cols-2 gap-2">{['Transport', 'Lunch', 'Airtime', 'Packaging'].map(o => <button key={o} onClick={() => { setDesc(o); document.querySelector('input[placeholder="Amount"]').focus() }} className="p-3 bg-white rounded-lg shadow-sm text-sm text-slate-600 hover:text-emerald-600 font-medium transition-colors">{o}</button>)}</div></div></div>);
    };

    const CustomerPanel = ({ customers, setCustomers, currentUser }) => {
      const [form, setForm] = useState({ name: '', phone: '' });
      const [editingId, setEditingId] = useState(null);
      const [searchTerm, setSearchTerm] = useState('');
      const [currentPage, setCurrentPage] = useState(1);
      
      useEffect(() => { setCurrentPage(1); }, [searchTerm]);

      const handleSave = () => {
        if (!form.name || !form.phone) return toast.error("Name and Phone are required.");
        if (editingId) {
          setCustomers(customers.map(c => c.id === editingId ? { ...c, ...form } : c));
          toast.success("Customer updated.");
        } else {
          if (customers.some(c => c.phone === form.phone)) {
            return toast.error("A customer with this phone number already exists.");
          }
          setCustomers([...customers, { ...form, id: crypto.randomUUID() }]);
          toast.success("Customer added.");
        }
        setForm({ name: '', phone: '' });
        setEditingId(null);
      };

      const handleEdit = (customer) => {
        setEditingId(customer.id);
        setForm({ name: customer.name, phone: customer.phone });
      };

      const handleDelete = (id) => {
        if (confirm("Are you sure you want to delete this customer?")) {
          setCustomers(customers.filter(c => c.id !== id));
          toast.success("Customer deleted.");
        }
      };

      const filteredCustomers = useMemo(() => customers.filter(c =>
        (c.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.phone.includes(searchTerm)
      ), [customers, searchTerm]);

      return (
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Customers</h2>
            <p className="text-slate-500">Manage your customer list</p>
          </div>
          <div className="card grid md:grid-cols-3 gap-4 bg-white">
            <input id="field-53" name="field-53" className="input-field" placeholder="Customer Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            <input id="field-54" name="field-54" className="input-field" placeholder="Phone Number" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
            <button onClick={handleSave} className="btn-primary">{editingId ? 'Save Changes' : 'Add Customer'}</button>
            {editingId && <button onClick={() => { setEditingId(null); setForm({ name: '', phone: '' }) }} className="text-sm text-slate-500 text-center md:col-span-3">Cancel Edit</button>}
          </div>
          <div className="card bg-white p-0 overflow-hidden">
            <div className="p-4 border-b">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input id="field-55" name="field-55" className="input-field pl-10" placeholder="Search by name or phone..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 border-b">
                  <tr>
                    <th className="p-4">Name</th>
                    <th className="p-4">Phone</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredCustomers.slice((currentPage - 1) * 50, currentPage * 50).map(c => (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <td className="p-4 font-medium text-slate-800">{c.name}</td>
                      <td className="p-4 text-slate-500">{c.phone}</td>
                      <td className="p-4 flex justify-end gap-2">
                        <button onClick={() => handleEdit(c)} className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg"><Edit2 className="w-4 h-4" /></button>
                        <button onClick={() => handleDelete(c.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  ))}
                  {filteredCustomers.length === 0 && (
                    <tr><td colSpan="3" className="p-8 text-center text-slate-400">No customers found.</td></tr>
                  )}
                </tbody>
              </table>
              <Pagination totalItems={filteredCustomers.length} itemsPerPage={50} currentPage={currentPage} setCurrentPage={setCurrentPage} />
            </div>
          </div>
        </div>
      );
    };


    const SummaryPanel = ({ products, salesHistory, setSalesHistory, expenses, debts, settings, stockHistory, setStockHistory, currentUser, onCancelSale }) => {
      const [view, setView] = useState('none');
      const [salesSearch, setSalesSearch] = useState(''); const [stockSearch, setStockSearch] = useState('');
      const [salesDateRange, setSalesDateRange] = useState({ start: '', end: '' });
      const [stockDateRange, setStockDateRange] = useState({ start: '', end: '' });
      const [showPdfReminder, setShowPdfReminder] = useState(true);
      const [salesCurrentPage, setSalesCurrentPage] = useState(1);
      const [stockCurrentPage, setStockCurrentPage] = useState(1);
      
      useEffect(() => { setSalesCurrentPage(1); }, [salesSearch, salesDateRange]);
      useEffect(() => { setStockCurrentPage(1); }, [stockSearch, stockDateRange]);
      
      // NEW STATE for owner's sales history specific view
      const [showOwnerDailySalesSummary, setShowOwnerDailySalesSummary] = useState(false);

      useEffect(() => {
        const lastDownloadDate = localStorage.getItem('lastPdfDownloadDate');
        const today = new Date().toISOString().split('T')[0];
        if (lastDownloadDate === today) {
          setShowPdfReminder(false);
        }
      }, []);

      const revenue = salesHistory.reduce((a, b) => b.paymentMethod !== 'debt' ? a + (b.finalPrice || b.price * b.quantity) : a, 0); const expenseTotal = expenses.reduce((a, b) => a + b.amount, 0); const profit = salesHistory.reduce((a, b) => b.paymentMethod !== 'debt' ? a + b.profit : a, 0) - expenseTotal; const debtTotal = debts.reduce((a, b) => a + b.amount, 0); const stockVal = products.reduce((a, b) => a + (b.cost * b.stock), 0); const totalProducts = products.length; const totalStock = products.reduce((a, b) => a + b.stock, 0);
      const salesByProduct = [...salesHistory].reduce((acc, sale) => { if (sale.paymentMethod !== 'debt') { acc[sale.name] = (acc[sale.name] || 0) + sale.quantity; } return acc; }, {});
      const productChartData = Object.keys(salesByProduct).map(name => ({ name, quantity: salesByProduct[name] })).sort((a, b) => b.quantity - a.quantity);

      const generateProductPdf = () => {
        const doc = new jsPDF();
        
        const chunked = [];
        for (let i = 0; i < products.length; i += 50) {
          chunked.push(products.slice(i, i + 50));
        }

        if (chunked.length === 0) {
          toast.error("No products to generate PDF.");
          return;
        }

        chunked.forEach((chunk, index) => {
          if (index > 0) doc.addPage();
          doc.setFontSize(16);
          doc.text(`Product Stock Sheet - Page ${index + 1}`, 14, 15);
          autoTable(doc, {
            startY: 20,
            head: [['Name', 'Price', 'Cost', 'Category', 'Stock', 'Expiry']],
            body: chunk.map(p => [p.name, '', '', p.category || '-', '', p.expiry || '-']),
            theme: 'grid',
            styles: { fontSize: 9, cellPadding: 3, minCellHeight: 12 },
            headStyles: { fillColor: [16, 185, 129] },
          });
        });
        
        doc.save(`Product_Stock_Sheet_${new Date().toISOString().split('T')[0]}.pdf`);
        toast.success("PDF Generated Successfully!");
      };

      const clear = (type) => { if (confirm(`Clear all ${type} history? This cannot be undone.`)) { if (type === 'sales') setSalesHistory([]); if (type === 'stock') setStockHistory([]); toast.success('Cleared'); } };

      const filterByDate = (items, dateRange) => {
        if (!dateRange.start && !dateRange.end) return items;
        const start = dateRange.start ? new Date(dateRange.start) : null;
        const end = dateRange.end ? new Date(dateRange.end) : null;
        if (start) start.setHours(0, 0, 0, 0);
        if (end) end.setHours(23, 59, 59, 999);
        return items.filter(item => {
          const itemDate = new Date(item.date);
          return (!start || itemDate >= start) && (!end || itemDate <= end);
        });
      };

      const filteredSales = useMemo(() => {
        return filterByDate([...salesHistory], salesDateRange).reverse().filter(s => (s.name || '').toLowerCase().includes(salesSearch.toLowerCase()));
      }, [salesHistory, salesDateRange, salesSearch]);

      const filteredStock = useMemo(() => {
        return filterByDate([...stockHistory], stockDateRange).reverse().filter(s => (s.name || '').toLowerCase().includes(stockSearch.toLowerCase()));
      }, [stockHistory, stockDateRange, stockSearch]);

      // NEW CALCULATIONS for owner's date-filtered sales summary
      const ownerDailySalesTotal = useMemo(() => filteredSales.reduce((sum, s) => s.paymentMethod !== 'debt' ? sum + s.finalPrice : sum, 0), [filteredSales]);
      const ownerDailyProfitTotal = useMemo(() => filteredSales.reduce((sum, s) => s.paymentMethod !== 'debt' ? sum + s.profit : sum, 0), [filteredSales]);
      const ownerDailyStockSold = useMemo(() => filteredSales.reduce((sum, s) => s.paymentMethod !== 'debt' ? sum + s.quantity : sum, 0), [filteredSales]);


      // Removed generatePDF and handleDownloadPdf from here

      return (<div className="space-y-6">
        <h2 className="text-2xl font-bold text-slate-800">Business Analytics</h2>
        {showPdfReminder && (<div className="bg-amber-50 border-l-4 border-amber-400 p-4 rounded-r-lg mb-6 flex justify-between items-center shadow-sm"><div className="flex-1"><h4 className="font-bold text-amber-800">Daily Report Reminder</h4><p className="text-sm text-amber-700 mt-1">Don't forget to download your business report for your records.</p></div><button onClick={() => setShowPdfReminder(false)} className="p-1.5 text-amber-500 hover:bg-amber-100 rounded-full"><X className="w-5 h-5" /></button></div>)}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"><KPICard title="Total Revenue" val={revenue} icon={DollarSign} color="text-emerald-600" bg="bg-emerald-50" />{settings.showCosts && (currentUser?.role === 'owner' || !!currentUser?.permissions?.viewCostPrice) && <KPICard title="Net Profit" val={profit} icon={TrendingUp} color="text-blue-600" bg="bg-blue-50" />}<KPICard title="Total Expenses" val={expenseTotal} icon={TrendingDown} color="text-red-600" bg="bg-red-50" /><KPICard title="Pending Debts" val={debtTotal} icon={AlertCircle} color="text-amber-600" bg="bg-amber-50" /></div><div className="grid grid-cols-1 sm:grid-cols-3 gap-4"><KPICard title="Total Products" val={totalProducts} icon={Package} color="text-indigo-600" bg="bg-indigo-50" /><KPICard title="Total Stock Items" val={totalStock} icon={ClipboardList} color="text-purple-600" bg="bg-purple-50" />{settings.showCosts && (currentUser?.role === 'owner' || !!currentUser?.permissions?.viewCostPrice) && <KPICard title="Stock Value" val={stockVal} icon={TagIcon} color="text-pink-600" bg="bg-pink-50" />}</div>

        {/* NEW SECTION FOR OWNER'S DATE-FILTERED SALES SUMMARY */}
        {currentUser?.role === 'owner' && (
          <div className="card space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-slate-700 flex items-center gap-2">
                <Clock className="w-5 h-5 text-emerald-600" /> Date-Filtered Sales Overview
              </h3>
              <button
                onClick={() => setShowOwnerDailySalesSummary(!showOwnerDailySalesSummary)}
                className="text-sm font-medium text-emerald-600 hover:underline"
              >
                {showOwnerDailySalesSummary ? 'Hide' : 'Show'} Details
              </button>
            </div>

            {showOwnerDailySalesSummary && (
              <>
                <div className="flex flex-wrap gap-2 items-center">
                  <label className="text-sm font-medium text-slate-600">From:</label>
                  <input id="field-56" name="field-56" type="date" value={salesDateRange.start} onChange={e => setSalesDateRange({ ...salesDateRange, start: e.target.value })} className="input-field py-1.5 text-sm w-36" />
                  <label className="text-sm font-medium text-slate-600">To:</label>
                  <input id="field-57" name="field-57" type="date" value={salesDateRange.end} onChange={e => setSalesDateRange({ ...salesDateRange, end: e.target.value })} className="input-field py-1.5 text-sm w-36" />
                </div>
                {salesDateRange.start || salesDateRange.end ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                    <KPICard title="Sales Total" val={ownerDailySalesTotal} icon={DollarSign} color="text-emerald-600" bg="bg-emerald-50" />
                    <KPICard title="Total Profit" val={ownerDailyProfitTotal} icon={Percent} color="text-blue-600" bg="bg-blue-50" />
                    <KPICard title="Total Stock Sold" val={ownerDailyStockSold} icon={TagIcon} color="text-purple-600" bg="bg-purple-50" />
                  </div>
                ) : (
                  <p className="text-sm text-slate-400 text-center py-4">Select a date range to view sales summary.</p>
                )}
              </>
            )}
          </div>
        )}

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="font-semibold text-slate-700 mb-4">Product Sales by Quantity</h3>
          <div className="w-full max-h-[500px] overflow-y-auto pr-4">
            <ResponsiveContainer width="100%" height={Math.max(350, productChartData.length * 40)}>
              <BarChart data={productChartData} layout="vertical" margin={{ top: 5, right: 20, left: 100, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} />
                <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 12 }} interval={0} />
                <Tooltip formatter={(value) => `${value.toLocaleString()} units`} />
                <Bar dataKey="quantity" fill="#10b981" radius={[0, 4, 4, 0]} barSize={25} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="flex gap-4 flex-wrap">
          <button onClick={() => setView('sales')} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-3 rounded-xl shadow-lg shadow-emerald-100 font-medium"><FileText className="w-5 h-5" /> View Sales History</button>
          <button onClick={() => setView('stock')} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 rounded-xl shadow-lg shadow-blue-100 font-medium"><ClipboardList className="w-5 h-5" /> View Stock History</button>
          <button onClick={generateProductPdf} className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-5 py-3 rounded-xl shadow-lg shadow-purple-100 font-medium"><FileText className="w-5 h-5" /> Print Stock Sheet</button>
        </div>
        {view === 'sales' && (<HistoryModal title="Sales History" searchVal={salesSearch} onSearchChange={setSalesSearch} dateRange={salesDateRange} onDateChange={setSalesDateRange} onClose={() => setView('none')} onClear={() => clear('sales')} canDelete={currentUser?.role === 'owner'}><table className="w-full text-sm text-left"><thead className="bg-slate-50 text-slate-500 font-medium sticky top-0"><tr><th className="p-3">Date</th><th className="p-3">Product</th><th className="p-3">Qty</th><th className="p-3">Method</th><th className="p-3">Cashier</th><th className="p-3 text-right">Discount</th><th className="p-3 text-right">Total</th>{currentUser?.role === 'owner' && <th className="p-3 text-right">Action</th>}</tr></thead><tbody className="divide-y divide-slate-100">{filteredSales.slice((salesCurrentPage - 1) * 50, salesCurrentPage * 50).map(s => <tr key={s.id} className="hover:bg-slate-50"><td className="p-3 text-slate-500">{new Date(s.date).toLocaleString()}</td><td className="p-3 font-medium text-slate-800">{s.name}</td><td className="p-3">{s.quantity}</td><td className="p-3 uppercase text-xs font-bold text-slate-500">{s.paymentMethod}</td><td className="p-3 text-slate-500">{s.cashierName}</td><td className="p-3 text-right font-medium text-red-500">{s.discount?.value > 0 ? (s.discount?.type === 'percent' ? `${s.discount.value}%` : `Ksh. ${parseFloat(s.discount.value).toLocaleString()}`) : '-'}</td><td className="p-3 text-right font-bold text-emerald-600">Ksh. {(s.finalPrice).toLocaleString()}</td>{currentUser?.role === 'owner' && (<td className="p-3 text-right"><button onClick={() => onCancelSale(s.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg disabled:text-slate-300 disabled:hover:bg-transparent" title="Cancel Sale" disabled={s.paymentMethod === 'debt'}><Trash2 className="w-4 h-4" /></button></td>)}</tr>)}</tbody></table><Pagination totalItems={filteredSales.length} itemsPerPage={50} currentPage={salesCurrentPage} setCurrentPage={setSalesCurrentPage} /></HistoryModal>)}
        {view === 'stock' && (<HistoryModal title="Stock History" searchVal={stockSearch} onSearchChange={setStockSearch} dateRange={stockDateRange} onDateChange={setStockDateRange} onClose={() => setView('none')} onClear={() => clear('stock')}><table className="w-full text-sm text-left"><thead className="bg-slate-50 text-slate-500 font-medium sticky top-0"><tr><th className="p-3">Date</th><th className="p-3">Product</th><th className="p-3">Added by</th><th className="p-3 text-right">Qty Added</th></tr></thead><tbody className="divide-y divide-slate-100">{filteredStock.slice((stockCurrentPage - 1) * 50, stockCurrentPage * 50).map((s, i) => <tr key={i} className="hover:bg-slate-50"><td className="p-3 text-slate-500">{new Date(s.date).toLocaleString()}</td><td className="p-3 font-medium text-slate-800">{s.name}</td><td className="p-3 text-slate-500">{s.cashierName}</td><td className="p-3 text-right font-bold text-blue-600">+{s.qty}</td></tr>)}</tbody></table><Pagination totalItems={filteredStock.length} itemsPerPage={50} currentPage={stockCurrentPage} setCurrentPage={setStockCurrentPage} /></HistoryModal>)}</div>);
    };

    
    const StaffProfilesPanel = ({ users, salesHistory, stockHistory, expenses, products, customers }) => {
      const [selectedStaffForSales, setSelectedStaffForSales] = useState(null);
      const [selectedMonth, setSelectedMonth] = useState(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      });

      const stats = useMemo(() => {
        // Collect all unique user names from history and current users
        const safeUsers = users || [];
        const safeSales = salesHistory || [];
        const safeStock = stockHistory || [];
        const safeExpenses = expenses || [];
        const safeProducts = products || [];
        const safeCustomers = customers || [];

        const userNames = new Set(safeUsers.map(u => u.name).filter(Boolean));
        safeSales.forEach(s => s.cashierName && userNames.add(s.cashierName));
        safeStock.forEach(s => s.cashierName && userNames.add(s.cashierName));
        safeExpenses.forEach(e => e.cashierName && userNames.add(e.cashierName));
        safeProducts.forEach(p => p.cashierName && userNames.add(p.cashierName));
        safeCustomers.forEach(c => c.cashierName && userNames.add(c.cashierName));

        // Filter events by selected month
        const filterByMonth = (items, dateField = 'timestamp') => {
          return items.filter(item => {
            const d = new Date(item[dateField] || item.date || item.dateAdded);
            if (isNaN(d.getTime())) return false;
            const itemMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            return itemMonth === selectedMonth;
          });
        };

        const mSales = filterByMonth(safeSales, 'date').filter(s => s.paymentMethod !== 'debt');
        const mStock = filterByMonth(safeStock, 'date');
        const mExpenses = filterByMonth(safeExpenses, 'timestamp');
        const mProducts = filterByMonth(safeProducts, 'timestamp');
        const mCustomers = filterByMonth(safeCustomers, 'timestamp');

        const result = Array.from(userNames).map(name => {
          const userSales = mSales.filter(s => s.cashierName === name);
          const productsSold = userSales.reduce((acc, s) => acc + s.quantity, 0);
          const profitGenerated = userSales.reduce((acc, s) => acc + s.profit, 0);

          const userStock = mStock.filter(s => s.cashierName === name);
          const stockAdded = userStock.reduce((acc, s) => acc + s.qty, 0);

          const userExpenses = mExpenses.filter(e => e.cashierName === name);
          const expensesCount = userExpenses.length;
          const expensesAmount = userExpenses.reduce((acc, e) => acc + e.amount, 0);

          const userProducts = mProducts.filter(p => p.cashierName === name);
          const productsAddedCount = userProducts.length;

          const userCustomers = mCustomers.filter(c => c.cashierName === name);
          const customersAddedCount = userCustomers.length;

          // Find role if currently active user
          const currentUserInfo = safeUsers.find(u => u.name === name);
          const role = currentUserInfo ? currentUserInfo.role : 'legacy/deleted';

          return {
            name,
            role,
            userSales,
            productsSold,
            profitGenerated,
            stockAdded,
            expensesCount,
            expensesAmount,
            productsAddedCount,
            customersAddedCount
          };
        });

        // Sort: Owner first, then by profit desc
        return result.sort((a, b) => {
          if (a.role === 'owner' && b.role !== 'owner') return -1;
          if (b.role === 'owner' && a.role !== 'owner') return 1;
          return b.profitGenerated - a.profitGenerated;
        });
      }, [users, salesHistory, stockHistory, expenses, products, customers, selectedMonth]);

      return (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold text-slate-800">Staff Profiles</h2>
              <p className="text-slate-500">Track cashier activities and performance</p>
            </div>
            <div className="flex items-center gap-3 bg-white p-2 rounded-xl shadow-sm border border-slate-200">
              <Calendar className="w-5 h-5 text-emerald-600" />
              <input id="field-58" name="field-58" type="month" 
                value={selectedMonth} 
                onChange={(e) => setSelectedMonth(e.target.value)} 
                className="outline-none bg-transparent font-medium text-slate-700"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {stats.map(s => (
              <div key={s.name} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                <div className={`p-4 ${s.role === 'owner' ? 'bg-purple-50 border-b border-purple-100' : 'bg-blue-50 border-b border-blue-100'} flex justify-between items-center`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white ${s.role === 'owner' ? 'bg-purple-500' : 'bg-blue-500'}`}>
                      {(s.name || '?').charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800">{s.name}</h3>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${s.role === 'owner' ? 'bg-purple-200 text-purple-700' : 'bg-blue-200 text-blue-700'}`}>
                        {s.role.toUpperCase()}
                      </span>
                    </div>
                  </div>
                </div>
                
                <div className="p-5 flex-1 grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <span className="text-xs text-slate-400 font-medium uppercase">Products Sold</span>
                    <p className="text-xl font-bold text-slate-700">{s.productsSold}</p>
                    <button onClick={() => setSelectedStaffForSales(s.name)} className="text-xs text-emerald-600 font-medium hover:underline flex items-center gap-1 mt-1"><Eye className="w-3 h-3" /> View Sales</button>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-slate-400 font-medium uppercase">Profit Gen.</span>
                    <p className="text-xl font-bold text-emerald-600">Ksh. {s.profitGenerated.toLocaleString()}</p>
                  </div>
                  
                  <div className="col-span-2 my-2 border-t border-slate-100"></div>

                  <div className="space-y-1">
                    <span className="text-xs text-slate-400 font-medium uppercase">Stock Added</span>
                    <p className="text-lg font-semibold text-slate-700">{s.stockAdded} units</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-slate-400 font-medium uppercase">Products Added</span>
                    <p className="text-lg font-semibold text-slate-700">{s.productsAddedCount}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-slate-400 font-medium uppercase">Customers Added</span>
                    <p className="text-lg font-semibold text-slate-700">{s.customersAddedCount}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-slate-400 font-medium uppercase">Expenses Added</span>
                    <p className="text-lg font-semibold text-red-500">{s.expensesCount} (Ksh. {s.expensesAmount.toLocaleString()})</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {stats.length === 0 && (
            <div className="text-center p-12 text-slate-400">
              No activity recorded for {selectedMonth}.
            </div>
          )}
          {selectedStaffForSales && (() => {
             const staffStat = stats.find(s => s.name === selectedStaffForSales);
             const salesToDisplay = staffStat ? [...staffStat.userSales].sort((a, b) => new Date(b.date) - new Date(a.date)) : [];
             return (
               <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                 <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl relative flex flex-col max-h-[80vh]">
                   <div className="p-4 border-b flex justify-between items-center bg-slate-50 rounded-t-2xl">
                     <h3 className="font-bold text-slate-800 flex items-center gap-2">
                       <FileText className="w-5 h-5 text-emerald-600" /> 
                       {selectedStaffForSales}'s Sales ({selectedMonth})
                     </h3>
                     <button onClick={() => setSelectedStaffForSales(null)}><X className="w-5 h-5 text-slate-500 hover:text-slate-800" /></button>
                   </div>
                   <div className="overflow-y-auto p-0">
                     <table className="w-full text-sm text-left">
                       <thead className="bg-slate-50 text-slate-500 font-medium sticky top-0">
                         <tr>
                           <th className="p-3">Date</th>
                           <th className="p-3">Product</th>
                           <th className="p-3 text-center">Qty</th>
                           <th className="p-3 text-right">Total (Ksh)</th>
                         </tr>
                       </thead>
                       <tbody className="divide-y divide-slate-100">
                         {salesToDisplay.map(sale => (
                           <tr key={sale.id} className="hover:bg-slate-50">
                             <td className="p-3 text-slate-500">{new Date(sale.date).toLocaleString()}</td>
                             <td className="p-3 font-medium text-slate-800">{sale.name}</td>
                             <td className="p-3 text-center">{sale.quantity}</td>
                             <td className="p-3 text-right font-bold text-emerald-600">{sale.finalPrice.toLocaleString()}</td>
                           </tr>
                         ))}
                         {salesToDisplay.length === 0 && (
                           <tr>
                             <td colSpan="4" className="p-8 text-center text-slate-400">No sales found for this period.</td>
                           </tr>
                         )}
                       </tbody>
                     </table>
                   </div>
                 </div>
               </div>
             );
          })()}
        </div>
      );
    };

    const SupplierPanel = ({ settings, setSettings, products }) => {
      const { suppliers = [] } = settings;
      const setSuppliers = (newSuppliers) => setSettings({ ...settings, suppliers: newSuppliers });
      const [form, setForm] = useState({ name: '', phone: '', productIds: [] });
      const [editingId, setEditingId] = useState(null);
      const [showOrderModal, setShowOrderModal] = useState(false);
      const [isProductSelectorOpen, setIsProductSelectorOpen] = useState(false);
      const [orderItems, setOrderItems] = useState([]);
      const [initialSupplierId, setInitialSupplierId] = useState(null);
      const [currentPage, setCurrentPage] = useState(1);
      const lowStockProducts = useMemo(() => products.filter(p => p.stock <= 5), [products]);

      const handleSave = () => {
        if (!form.name || !form.phone) return toast.error("Name and Phone are required.");
        if (editingId) {
          setSuppliers(suppliers.map(s => s.id === editingId ? { ...s, name: form.name, phone: form.phone, productIds: form.productIds } : s));
          toast.success("Supplier updated.");
        } else {
          setSuppliers([...suppliers, { ...form, id: crypto.randomUUID() }]);
          toast.success("Supplier added.");
        }
        setForm({ name: '', phone: '', productIds: [] });
        setEditingId(null);
      };

      const handleEdit = (supplier) => {
        setEditingId(supplier.id);
        setForm({ name: supplier.name, phone: supplier.phone, productIds: supplier.productIds || [] });
      };

      const handleDelete = (id) => { if (confirm("Delete this supplier?")) setSuppliers(suppliers.filter(s => s.id !== id)); };

      const handleCreateOrder = (items) => {
        const perfectSupplier = suppliers.find(s => items.every(item => (s.productIds || []).includes(item.id)));
        setInitialSupplierId(perfectSupplier ? perfectSupplier.id : null);
        setOrderItems(items);
        setShowOrderModal(true);
      };

      return (<div className="space-y-6">
        <div><h2 className="text-2xl font-bold text-slate-800">Suppliers & Procurement</h2><p className="text-slate-500">Manage suppliers and create purchase orders.</p></div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="card bg-white">
              <h3 className="font-semibold text-slate-700 mb-4">{editingId ? 'Edit Supplier' : 'Add New Supplier'}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input id="field-59" name="field-59" className="input-field" placeholder="Supplier Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                <input id="field-60" name="field-60" className="input-field" placeholder="Phone Number" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
                <div className="md:col-span-2">
                  <label className="text-sm font-medium text-slate-600 mb-1 block">Products Supplied</label>
                  <div className="p-2 border rounded-lg min-h-[60px] bg-slate-50 flex flex-wrap gap-2">
                    {form.productIds.length > 0 ? form.productIds.map(id => {
                      const product = products.find(p => (p && p.id) === id);
                      return product ? <span key={id} className="px-2 py-1 bg-emerald-100 text-emerald-800 text-xs font-medium rounded-full">{product.name}</span> : null;
                    }) : <span className="text-slate-400 text-sm p-2">No products selected</span>}
                  </div>
                  <button onClick={() => setIsProductSelectorOpen(true)} className="text-sm text-emerald-600 font-medium hover:underline mt-2">
                    {form.productIds.length > 0 ? 'Edit' : 'Select'} Products
                  </button>
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-4">
                {editingId && <button onClick={() => { setEditingId(null); setForm({ name: '', phone: '', productIds: [] }) }} className="font-medium text-slate-600 hover:text-slate-800">Cancel</button>}
                <button onClick={handleSave} className="btn-primary px-6 py-2.5">{editingId ? 'Save Changes' : 'Add Supplier'}</button>
              </div>
            </div>
            <div className="card bg-white p-0 overflow-hidden"><div className="p-5"><h3 className="font-semibold text-slate-700">Supplier List</h3></div><div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead className="bg-slate-50 text-slate-500"><tr><th className="p-4">Name</th><th className="p-4">Contact</th><th className="p-4">Products</th><th className="p-4 text-right">Actions</th></tr></thead><tbody className="divide-y">{suppliers.slice((currentPage - 1) * 50, currentPage * 50).map(s => (<tr key={s.id}><td className="p-4 font-medium text-slate-800">{s.name}</td><td className="p-4 text-slate-500">{s.phone}</td><td className="p-4 text-slate-500">{(s.productIds || []).slice(0, 3).map(id => { const p = products.find(prod => prod.id === id); return p ? <div key={id} className="text-xs">â€¢ {p.name}</div> : null; })} {(s.productIds || []).length > 3 && <div className="text-xs text-slate-400 mt-1">+{s.productIds.length - 3} more</div>}</td><td className="p-4 flex justify-end gap-2"><button onClick={() => handleEdit(s)} className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg"><Edit2 className="w-4 h-4" /></button><button onClick={() => handleDelete(s.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button></td></tr>))}</tbody></table><Pagination totalItems={suppliers.length} itemsPerPage={50} currentPage={currentPage} setCurrentPage={setCurrentPage} /></div></div>
          </div>
          <div className="card bg-white">
            <h3 className="font-semibold text-slate-700 mb-4 flex items-center gap-2"><Bell className="w-5 h-5 text-red-500" /> Low Stock Items</h3>
            {lowStockProducts.length > 0 ? (<>
              <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
                {lowStockProducts.map(p => (
                  <div key={(p && p.id)} className="flex justify-between items-center p-2 bg-red-50/50 rounded-lg text-sm">
                    <span className="font-medium text-slate-700">{p.name}</span>
                    <span className="font-bold text-red-600">{p.stock} left</span>
                  </div>
                ))}
              </div>
              <button onClick={() => handleCreateOrder(lowStockProducts)} className="btn-primary bg-blue-600 hover:bg-blue-700 w-full mt-4 py-3">Create Order from Low Stock</button>
            </>) : <p className="text-sm text-slate-400 text-center py-8">No items are low on stock.</p>}
          </div>
        </div>
        {showOrderModal && <OrderModal initialProducts={orderItems} suppliers={suppliers} shopName={settings.name} onClose={() => setShowOrderModal(false)} initialSupplierId={initialSupplierId} />}
        {isProductSelectorOpen && <ProductSelectorModal allProducts={products} initialSelectedIds={form.productIds} onClose={() => setIsProductSelectorOpen(false)} onSave={(newIds) => { setForm(f => ({ ...f, productIds: newIds })); setIsProductSelectorOpen(false); toast.success('Products updated.'); }} />}
      </div>);
    };

    
    const CashierSettingsPanel = ({ currentUser, settings, setSettings }) => {
      const cashier = settings.cashiers?.find(c => c.id === currentUser.id);
      const [loginMethod, setLoginMethod] = useState(cashier?.password ? 'password' : 'pin');
      const [newPin, setNewPin] = useState(cashier?.pin || '');
      const [newPassword, setNewPassword] = useState(cashier?.password || '');
      const [showPwd, setShowPwd] = useState(false);

      const handleSave = () => {
        if (loginMethod === 'pin' && newPin.length !== 4) return toast.error('PIN must be 4 digits.');
        if (loginMethod === 'password' && newPassword.length < 4) return toast.error('Password must be at least 4 characters.');
        
        const updatedCashiers = settings.cashiers.map(c => 
          c.id === currentUser.id 
            ? { ...c, pin: loginMethod === 'pin' ? newPin : '', password: loginMethod === 'password' ? newPassword : '' } 
            : c
        );
        setSettings({ ...settings, cashiers: updatedCashiers });
        toast.success('Login credentials updated successfully.');
      };

      return (
        <div className="space-y-6 max-w-2xl mx-auto pb-20">
          <div><h2 className="text-2xl font-bold text-slate-800">My Settings</h2><p className="text-slate-500">Update your personal login credentials</p></div>
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Preferred Login Method</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input id="field-61" name="field-61" type="radio" checked={loginMethod === 'pin'} onChange={() => setLoginMethod('pin')} className="text-emerald-600 focus:ring-emerald-500" />
                  <span>4-Digit PIN</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input id="field-62" name="field-62" type="radio" checked={loginMethod === 'password'} onChange={() => setLoginMethod('password')} className="text-emerald-600 focus:ring-emerald-500" />
                  <span>Password</span>
                </label>
              </div>
            </div>

            {loginMethod === 'pin' ? (
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">New PIN (4 Digits)</label>
                <input id="field-63" name="field-63" type="text" maxLength="4" className="input-field max-w-xs text-xl tracking-[0.5em] text-center" value={newPin} onChange={e => setNewPin(e.target.value.replace(/[^0-9]/g, ''))} />
              </div>
            ) : (
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">New Password</label>
                <div className="relative max-w-xs">
                  <input id="field-64" name="field-64" type={showPwd ? "text" : "password"} className="input-field" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
                  <button type="button" onClick={() => setShowPwd(!showPwd)} className="absolute right-3 top-2.5 text-xs text-slate-400 font-bold hover:text-slate-600">{showPwd ? 'HIDE' : 'SHOW'}</button>
                </div>
              </div>
            )}
            
            <button onClick={handleSave} className="btn-primary bg-emerald-600 hover:bg-emerald-700 px-6 py-2">Save Changes</button>
          </div>
        </div>
      );
    };

    // ─── Connect Database Section ─────────────────────────────────────────────
    const ConnectDatabaseSection = () => {
      const [dbUrl, setDbUrl] = useState('');
      const [dbToken, setDbToken] = useState('');
      const [isConnected, setIsConnected] = useState(false);
      const [isLoading, setIsLoading] = useState(false);
      const [statusMsg, setStatusMsg] = useState('');
      const [statusType, setStatusType] = useState(''); // 'success' | 'error'

      // Restore session from localStorage on mount
      useEffect(() => {
        try {
          const raw = localStorage.getItem('db_session');
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.url && parsed.token) {
              setDbUrl(parsed.url);
              setDbToken(parsed.token);
              setIsConnected(true);
            }
          }
        } catch (_) {
          localStorage.removeItem('db_session');
        }
      }, []);

      const handleConnect = async () => {
        const trimmedUrl = dbUrl.replace(/["'\s]/g, '');
        const trimmedToken = dbToken.replace(/["'\s]/g, '');
        if (!trimmedUrl || !trimmedToken) {
          setStatusMsg('Please enter both the Database URL and Auth Token.');
          setStatusType('error');
          return;
        }
        setIsLoading(true);
        setStatusMsg('');
        try {
          const res = await fetch('/api/connect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: trimmedUrl, token: trimmedToken }),
          });
          const data = await res.json();
          if (data.ok) {
            localStorage.setItem('db_session', JSON.stringify({ url: trimmedUrl, token: trimmedToken }));
            setIsConnected(true);
            setStatusMsg('Database connected! Checking for existing data...');
            setStatusType('success');
            toast.success('🔗 Database connected!');
            
            // Try to pull data first. If data exists, it will save to local DB and return true.
            tursoPullAll().then((pulled) => {
              if (pulled) {
                setStatusMsg('Data downloaded from Turso! Reloading app...');
                setTimeout(() => window.location.reload(), 1500);
              } else {
                // If no data exists in Turso, push local data up
                setStatusMsg('Uploading existing local data to Turso...');
                tursoSyncAll().then(() => {
                  setStatusMsg('Database connected. Local data synced to Turso ✓');
                }).catch(() => {});
              }
            });
          } else {
            setStatusMsg(data.error || 'Connection failed. Please check your credentials.');
            setStatusType('error');
          }
        } catch (err) {
          setStatusMsg('Network error — could not reach the server. Please try again.');
          setStatusType('error');
        } finally {
          setIsLoading(false);
        }
      };

      const handleDisconnect = () => {
        localStorage.removeItem('db_session');
        setIsConnected(false);
        setDbUrl('');
        setDbToken('');
        setStatusMsg('');
        setStatusType('');
        toast.success('Database disconnected.');
      };

      return (
        <div className="pt-6 border-t border-slate-100">
          <h3 className="font-semibold text-slate-800 mb-1 flex items-center gap-2">
            <Key className="w-4 h-4 text-indigo-600" /> 🔗 Connect Database
          </h3>
          <p className="text-xs text-slate-400 mb-4">Connect a Turso (libSQL) database to sync your POS data.</p>

          {isConnected ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-emerald-700 font-semibold text-sm">
                <CheckCircle className="w-5 h-5 flex-shrink-0" />
                Database Connected
              </div>
              <p className="text-xs text-emerald-600 font-mono break-all">{dbUrl}</p>
              <button
                onClick={handleDisconnect}
                className="btn-primary bg-red-500 hover:bg-red-600 py-2 px-4 text-sm"
                style={{ boxShadow: '0 4px 10px -4px rgba(239,68,68,.5)' }}
              >
                <X className="w-4 h-4" /> Disconnect Database
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Turso Database URL</label>
                <input id="field-65" name="field-65" className="input-field"
                  placeholder="libsql://your-db-name.turso.io"
                  value={dbUrl}
                  onChange={e => setDbUrl(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Auth Token</label>
                <input id="field-66" name="field-66" className="input-field"
                  type="password"
                  placeholder="eyJhbGciOiJFZERTQSJ9..."
                  value={dbToken}
                  onChange={e => setDbToken(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <button
                onClick={handleConnect}
                disabled={isLoading}
                className="btn-primary py-2.5 px-5 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isLoading
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Key className="w-4 h-4" />}
                {isLoading ? 'Testing Connection…' : 'Test & Connect'}
              </button>
              {statusMsg && (
                <div className={`text-sm p-3 rounded-lg flex items-start gap-2 ${statusType === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                  {statusType === 'success'
                    ? <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    : <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
                  {statusMsg}
                </div>
              )}
            </div>
          )}
        </div>
      );
    };
    const CloudRecoverySection = () => {
      const [handle, setHandle] = useState('');
      const [pwd, setPwd] = useState('');
      const [status, setStatus] = useState('');
      const [saving, setSaving] = useState(false);

      const validatePassword = (p) => {
        if (p.length < 6) return 'Password must be at least 6 characters long';
        if (!/[a-zA-Z]/.test(p)) return 'Password must contain at least one letter';
        if (!/[0-9]/.test(p)) return 'Password must contain at least one number';
        return null;
      };

      const checkHandleExists = async (h) => {
        try {
          const res = await fetch(`${CLOUD_KV_API}/GetValue/${APP_NAMESPACE}/${encodeURIComponent(h)}_count`);
          if (!res.ok) return false;
          const text = await res.text();
          const clean = text.replace(/["\s]/g, '');
          return clean && clean !== 'null' && clean.length > 0 && !isNaN(parseInt(clean));
        } catch { return false; }
      };

      const generateRecoveryPdf = (storeHandle, masterPwd, creds) => {
        try {
          const doc = new jsPDF();
          const pw = doc.internal.pageSize.getWidth();

          // Header
          doc.setFillColor(16, 185, 129);
          doc.rect(0, 0, pw, 45, 'F');
          doc.setTextColor(255, 255, 255);
          doc.setFontSize(22);
          doc.setFont('helvetica', 'bold');
          doc.text('Softly Built - Recovery Credentials', pw / 2, 22, { align: 'center' });
          doc.setFontSize(10);
          doc.setFont('helvetica', 'normal');
          doc.text('CONFIDENTIAL - Keep this document in a safe place', pw / 2, 34, { align: 'center' });

          // Warning box
          doc.setFillColor(254, 243, 199);
          doc.roundedRect(15, 55, pw - 30, 25, 3, 3, 'F');
          doc.setDrawColor(217, 119, 6);
          doc.roundedRect(15, 55, pw - 30, 25, 3, 3, 'S');
          doc.setTextColor(146, 64, 14);
          doc.setFontSize(9);
          doc.setFont('helvetica', 'bold');
          doc.text('⚠  WARNING', 22, 64);
          doc.setFont('helvetica', 'normal');
          doc.text('This document contains your store recovery credentials. Anyone with access to this', 22, 71);
          doc.text('document can access your store data. Store it securely and never share it online.', 22, 77);

          // Credentials section
          let y = 95;
          doc.setTextColor(30, 41, 59);
          doc.setFontSize(14);
          doc.setFont('helvetica', 'bold');
          doc.text('Recovery Credentials', 15, y);
          y += 12;

          const drawField = (label, value, yPos) => {
            doc.setFillColor(248, 250, 252);
            doc.roundedRect(15, yPos, pw - 30, 22, 3, 3, 'F');
            doc.setTextColor(100, 116, 139);
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.text(label, 22, yPos + 8);
            doc.setTextColor(15, 23, 42);
            doc.setFontSize(11);
            doc.setFont('courier', 'normal');
            doc.text(String(value || 'N/A'), 22, yPos + 17);
            return yPos + 28;
          };

          y = drawField('Store Handle', storeHandle, y);
          y = drawField('Master Password', masterPwd, y);
          y += 8;

          // Database credentials section
          doc.setTextColor(30, 41, 59);
          doc.setFontSize(14);
          doc.setFont('helvetica', 'bold');
          doc.text('Database Credentials (Advanced)', 15, y);
          y += 12;

          y = drawField('Database URL', (creds && creds.url) ? creds.url : 'N/A', y);

          // Token is long, so handle it specially
          doc.setFillColor(248, 250, 252);
          doc.roundedRect(15, y, pw - 30, 32, 3, 3, 'F');
          doc.setTextColor(100, 116, 139);
          doc.setFontSize(9);
          doc.setFont('helvetica', 'bold');
          doc.text('Auth Token', 22, y + 8);
          doc.setTextColor(15, 23, 42);
          doc.setFontSize(7);
          doc.setFont('courier', 'normal');
          const tokenStr = String((creds && creds.token) ? creds.token : 'N/A');
          const tokenLines = doc.splitTextToSize(tokenStr, pw - 50);
          doc.text(tokenLines.slice(0, 3), 22, y + 16);
          y += 38;

          // Footer
          y += 10;
          doc.setDrawColor(226, 232, 240);
          doc.line(15, y, pw - 15, y);
          y += 8;
          doc.setTextColor(148, 163, 184);
          doc.setFontSize(8);
          doc.setFont('helvetica', 'normal');
          doc.text(`Generated: ${new Date().toLocaleString()}`, 15, y);
          doc.text('Softly Built POS System', pw - 15, y, { align: 'right' });

          doc.save(`Softly_Recovery_${storeHandle}.pdf`);
          return true;
        } catch (err) {
          console.error('PDF generation error:', err);
          toast.error('Could not generate recovery PDF. Please try again.');
          return false;
        }
      };

      const handleSave = async () => {
        const cleanHandle = handle.trim().replace(/^@/, '');
        if (!cleanHandle || !pwd) return toast.error('Handle and Password are required');
        
        const pwdError = validatePassword(pwd);
        if (pwdError) return toast.error(pwdError);

        const raw = localStorage.getItem('db_session');
        if (!raw) return toast.error('No active Turso connection to back up');

        setSaving(true);
        setStatus('Checking if handle is available...');

        const exists = await checkHandleExists(cleanHandle);
        if (exists) {
          setSaving(false);
          setStatus('');
          return toast.error(`Handle "${cleanHandle}" is already taken. Please choose a different one.`);
        }

        setStatus('Saving to Cloud Registry...');
        const creds = JSON.parse(raw);
        const ok = await uploadToCloudRegistry(cleanHandle, pwd, creds);
        if (ok) {
          toast.success('Recovery key saved securely!');
          setStatus('Saved! Downloading your backup PDF...');
          generateRecoveryPdf(cleanHandle, pwd, creds);
          setStatus('✅ Saved & PDF downloaded! Keep the PDF in a safe place.');
          setHandle(''); setPwd('');
        } else {
          toast.error('Failed to save to Cloud Registry');
          setStatus('Failed to save.');
        }
        setSaving(false);
      };

      const pwdError = pwd.length > 0 ? validatePassword(pwd) : null;

      return (
        <div className="bg-white rounded-2xl p-6 border border-slate-200 mt-6 shadow-sm">
          <h3 className="font-bold text-lg mb-2 flex items-center gap-2"><Key className="w-5 h-5 text-indigo-600" /> Cloud Recovery Setup</h3>
          <p className="text-sm text-slate-500 mb-4">Create a Store Handle and Master Password. If you lose your device, you can use these to instantly log back in without needing your database keys. Your keys are heavily encrypted and completely unreadable by anyone else.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">Store Handle (e.g. JohnsMart)</label>
              <input id="field-67" name="field-67" value={handle} onChange={e => setHandle(e.target.value)} className="input-field w-full font-mono text-sm" placeholder="StoreHandle" />
              <p className="text-[10px] text-slate-400 mt-1">Must be unique. No @ needed.</p>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">Master Password</label>
              <input id="field-68" name="field-68" type="password" value={pwd} onChange={e => setPwd(e.target.value)} className={`input-field w-full text-sm ${pwdError ? 'border-red-300 focus:ring-red-400' : ''}`} placeholder="••••••••" />
              {pwdError && <p className="text-[10px] text-red-500 mt-1">{pwdError}</p>}
              {!pwdError && pwd.length > 0 && <p className="text-[10px] text-emerald-600 mt-1">✓ Password is valid</p>}
            </div>
          </div>
          <button onClick={handleSave} disabled={saving} className={`btn-primary w-full py-3 ${saving ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'}`}>
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : <><Lock className="w-4 h-4" /> Save Recovery Key</>}
          </button>
          {status && <div className="mt-3 text-sm text-indigo-700 bg-indigo-50 p-3 rounded-lg border border-indigo-100">{status}</div>}
        </div>
      );
    };
    // ─────────────────────────────────────────────────────────────────────────

    const SettingsPanel = ({ settings, setSettings, updateProducts, updateSalesHistory, updateExpenses, updateDebts, updatePaidDebts, updateStockHistory, handleDownloadPdf }) => {
      const DEFAULT_PERMISSIONS = { editProducts: false, addStock: false, viewStockHistory: false, viewDebts: false, viewExpenses: false, viewCustomers: false, canDiscount: false, editPriceAndCost: false, viewSuppliers: false, bulkPriceUpdate: false, viewCostPrice: false };
      const PERMISSION_LABELS = { editProducts: "Edit/Delete Products", addStock: "Add Stock", viewStockHistory: "View Stock History", viewDebts: "Manage Debts", viewExpenses: "Manage Expenses", viewCustomers: "Manage Customers", canDiscount: "Give Discounts", editPriceAndCost: "Edit Price & Cost", viewSuppliers: "Manage Suppliers", bulkPriceUpdate: "Bulk Price Update", viewCostPrice: "View Cost Prices & Profit" };

      const [showPins, setShowPins] = useState(false);
      const [cashierForm, setCashierForm] = useState({ name: '', pin: '', role: 'cashier', permissions: { ...DEFAULT_PERMISSIONS } });
      const [editingCashierId, setEditingCashierId] = useState(null);
      const [editingCashierData, setEditingCashierData] = useState({ name: '', pin: '', role: 'cashier', permissions: { ...DEFAULT_PERMISSIONS } });
      const [showFullImportModal, setShowFullImportModal] = useState(false);
      const [selectedCashierQR, setSelectedCashierQR] = useState(null);

      const generateCashierQR = (cashier) => {
        const raw = localStorage.getItem('db_session');
        if (!raw) return toast.error('No database connection active.');
        const { url, token } = JSON.parse(raw);
        
        const payload = {
          url,
          token,
          cashierId: cashier.id,
          storeId: settings.name || 'store'
        };

        const encryptedPayload = CryptoJS.AES.encrypt(JSON.stringify(payload), String(cashier.pin)).toString();
        setSelectedCashierQR({
          name: cashier.name,
          qrString: encryptedPayload
        });
      };

      const update = (k, v) => { setSettings({ ...settings, [k]: v }); };
      const addCashier = () => { const { name, pin, role, permissions } = cashierForm; if (!name || !pin || pin.length !== 4) return toast.error('Name and 4-digit PIN required.'); if (settings.ownerPin === pin || settings.cashiers?.some(c => c.pin === pin)) return toast.error('PIN is already in use.'); const newCashiers = [...(settings.cashiers || []), { id: crypto.randomUUID(), name, pin, role: role || 'cashier', permissions }]; setSettings({ ...settings, cashiers: newCashiers }); setCashierForm({ name: '', pin: '', role: 'cashier', permissions: { ...DEFAULT_PERMISSIONS } }); toast.success('Staff added.'); };
      const removeCashier = (id) => { if (!confirm('Are you sure?')) return; setSettings({ ...settings, cashiers: settings.cashiers.filter(c => c.id !== id) }); toast.success('Staff removed.'); };
      const handleEditCashier = (cashier) => { setEditingCashierId(cashier.id); setEditingCashierData({ name: cashier.name, pin: cashier.pin, role: cashier.role || 'cashier', permissions: cashier.permissions || { ...DEFAULT_PERMISSIONS } }); };
      const handleSaveCashier = (id) => { const { name, pin } = editingCashierData; if (!name || !pin || pin.length !== 4) return toast.error('Name and 4-digit PIN required.'); if (settings.ownerPin === pin || settings.cashiers?.some(c => c.pin === pin && c.id !== id)) return toast.error('PIN is already in use.'); const updatedCashiers = settings.cashiers.map(c => c.id === id ? { ...c, ...editingCashierData } : c); setSettings({ ...settings, cashiers: updatedCashiers }); setEditingCashierId(null); toast.success('Staff updated.'); };
      const handleSoundUpload = (e) => { const file = e.target.files?.[0]; if (file) { const r = new FileReader(); r.onload = ev => { if (ev.target?.result) { update('scanSound', ev.target.result); new Audio(ev.target.result).play(); } }; r.readAsDataURL(file); } };

      return (<div className="max-w-3xl space-y-6 pb-20"><h2 className="text-2xl font-bold text-slate-800">Shop Settings</h2><div className="card space-y-6 bg-white p-6">
        <div><h3 className="font-semibold text-slate-800 mb-3">Receipt Details</h3><div className="space-y-3"><input id="field-69" name="field-69" className="input-field" placeholder="Shop Name" value={settings.name} onChange={e => update('name', e.target.value)} /><input id="field-70" name="field-70" className="input-field" placeholder="Address" value={settings.address} onChange={e => update('address', e.target.value)} /><input id="field-71" name="field-71" className="input-field" placeholder="Phone Number" value={settings.phone} onChange={e => update('phone', e.target.value)} /><input id="field-72" name="field-72" className="input-field" placeholder="Owner Name for Receipt" value={settings.ownerName || ''} onChange={e => update('ownerName', e.target.value)} /><input id="field-73" name="field-73" className="input-field" placeholder="Extra Info (e.g. Till Number)" value={settings.extraInfo} onChange={e => update('extraInfo', e.target.value)} /><input id="field-74" name="field-74" className="input-field" placeholder="Receipt Footer" value={settings.receiptFooter} onChange={e => update('receiptFooter', e.target.value)} /><input id="field-75" name="field-75" className="input-field" placeholder="Receipt Link (QR Code)" value={settings.receiptLink || ''} onChange={e => update('receiptLink', e.target.value)} />{settings.receiptLink && <div className="mt-2 p-4 bg-slate-50 border rounded-lg flex flex-col items-center"><p className="text-sm font-medium text-slate-600 mb-2">QR Code Preview:</p><img src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(settings.receiptLink)}`} alt="QR Code Preview" className="w-32 h-32 border shadow-sm rounded bg-white" /></div>}</div></div>

        <div className="pt-6 border-t"><h3 className="font-semibold text-slate-800 mb-4">Receipt Customization</h3><div className="space-y-4"><div className="grid grid-cols-2 gap-4"><div><label htmlFor="title-font" className="text-sm font-medium text-slate-700 block mb-1">Title Font Size</label><select id="title-font" value={settings.receiptTitleFontSize} onChange={e => update('receiptTitleFontSize', e.target.value)} className="input-field"><option>10pt</option><option>11pt</option><option>12pt</option><option>14pt</option><option>16pt</option></select></div><div><label htmlFor="body-font" className="text-sm font-medium text-slate-700 block mb-1">Body Font Size</label><select id="body-font" value={settings.receiptBodyFontSize} onChange={e => update('receiptBodyFontSize', e.target.value)} className="input-field"><option>8pt</option><option>9pt</option><option>10pt</option><option>11pt</option></select></div></div><div className="flex justify-between items-center pt-4 border-t"><span className="text-slate-700 font-medium text-sm">Show Address</span><button onClick={() => update('receiptShowAddress', !settings.receiptShowAddress)} className={`w-12 h-6 rounded-full relative transition-colors ${settings.receiptShowAddress ? 'bg-emerald-500' : 'bg-slate-200'}`}><div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${settings.receiptShowAddress ? 'left-7' : 'left-1'}`}></div></button></div><div className="flex justify-between items-center"><span className="text-slate-700 font-medium text-sm">Show Phone Number</span><button onClick={() => update('receiptShowPhone', !settings.receiptShowPhone)} className={`w-12 h-6 rounded-full relative transition-colors ${settings.receiptShowPhone ? 'bg-emerald-500' : 'bg-slate-200'}`}><div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${settings.receiptShowPhone ? 'left-7' : 'left-1'}`}></div></button></div><div className="flex justify-between items-center"><span className="text-slate-700 font-medium text-sm">Show Extra Info (Till)</span><button onClick={() => update('receiptShowExtraInfo', !settings.receiptShowExtraInfo)} className={`w-12 h-6 rounded-full relative transition-colors ${settings.receiptShowExtraInfo ? 'bg-emerald-500' : 'bg-slate-200'}`}><div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${settings.receiptShowExtraInfo ? 'left-7' : 'left-1'}`}></div></button></div><div className="flex justify-between items-center"><span className="text-slate-700 font-medium text-sm">Show Footer Message</span><button onClick={() => update('receiptShowFooter', !settings.receiptShowFooter)} className={`w-12 h-6 rounded-full relative transition-colors ${settings.receiptShowFooter ? 'bg-emerald-500' : 'bg-slate-200'}`}><div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${settings.receiptShowFooter ? 'left-7' : 'left-1'}`}></div></button></div><div className="flex justify-between items-center"><span className="text-slate-700 font-medium text-sm">Show QR Code</span><button onClick={() => update('receiptShowQr', settings.receiptShowQr === false ? true : false)} className={`w-12 h-6 rounded-full relative transition-colors ${settings.receiptShowQr !== false ? 'bg-emerald-500' : 'bg-slate-200'}`}><div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${settings.receiptShowQr !== false ? 'left-7' : 'left-1'}`}></div></button></div></div></div>

        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 pt-6 border-t">
          <h3 className="font-semibold text-slate-800 flex items-center gap-2"><UserPlus className="w-4 h-4 text-emerald-600" /> Staff Management</h3>
          <div className="grid grid-cols-4 gap-4 mt-4 mb-3">
            <input id="field-76" name="field-76" className="input-field" placeholder="Staff Name" value={cashierForm.name} onChange={e => setCashierForm({ ...cashierForm, name: e.target.value })} />
            <select className="input-field" value={cashierForm.role || 'cashier'} onChange={e => setCashierForm({ ...cashierForm, role: e.target.value })}>
              <option value="cashier">Cashier</option>
              <option value="owner">Owner</option>
            </select>
            <input id="field-77" name="field-77" type="number" className="input-field" placeholder="4-Digit PIN" value={cashierForm.pin} onChange={e => setCashierForm({ ...cashierForm, pin: e.target.value.replace(/\D/g, '').slice(0, 4) })} />
            <button onClick={addCashier} className="btn-primary">Add Staff</button>
          </div>
          {cashierForm.role !== 'owner' && (
            <div className="mb-4 p-3 bg-white border border-slate-200 rounded-lg">
              <h4 className="text-xs font-semibold text-slate-500 mb-2 uppercase">Permissions for new staff</h4>
              <div className="flex flex-wrap gap-3">
                {Object.keys(DEFAULT_PERMISSIONS).map(key => (
                  <label key={key} className="flex items-center gap-1.5 text-sm text-slate-700">
                    <input id="field-78" name="field-78" type="checkbox" checked={cashierForm.permissions[key]} onChange={e => setCashierForm({ ...cashierForm, permissions: { ...cashierForm.permissions, [key]: e.target.checked } })} className="w-4 h-4 text-emerald-600 rounded" />
                    {PERMISSION_LABELS[key]}
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="mt-4 space-y-2">
            {(settings.cashiers || []).map(cashier => editingCashierId === cashier.id ? (
              <div key={cashier.id} className="bg-white p-3 rounded-lg border shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <input id="field-79" name="field-79" className="input-field py-1" value={editingCashierData.name} onChange={e => setEditingCashierData({ ...editingCashierData, name: e.target.value })} placeholder="Name" />
                  <select className="input-field py-1 w-32" value={editingCashierData.role || 'cashier'} onChange={e => setEditingCashierData({ ...editingCashierData, role: e.target.value })}>
                    <option value="cashier">Cashier</option>
                    <option value="owner">Owner</option>
                  </select>
                  <input id="field-80" name="field-80" type="number" className="input-field py-1 w-24" value={editingCashierData.pin} onChange={e => setEditingCashierData({ ...editingCashierData, pin: e.target.value.replace(/\D/g, '').slice(0, 4) })} placeholder="PIN" />
                  <button onClick={() => handleSaveCashier(cashier.id)} className="p-2 text-green-600 hover:bg-green-50 rounded-full"><Save className="w-4 h-4" /></button>
                  <button onClick={() => setEditingCashierId(null)} className="p-2 text-slate-500 hover:bg-slate-100 rounded-full"><X className="w-4 h-4" /></button>
                </div>
                {editingCashierData.role !== 'owner' && (
                  <div className="pt-2 border-t border-slate-100">
                    <h4 className="text-xs font-semibold text-slate-500 mb-2 uppercase">Edit Permissions</h4>
                    <div className="flex flex-wrap gap-3">
                      {Object.keys(DEFAULT_PERMISSIONS).map(key => (
                        <label key={key} className="flex items-center gap-1.5 text-sm text-slate-700">
                          <input id="field-81" name="field-81" type="checkbox" checked={editingCashierData.permissions[key]} onChange={e => setEditingCashierData({ ...editingCashierData, permissions: { ...editingCashierData.permissions, [key]: e.target.checked } })} className="w-4 h-4 text-emerald-600 rounded" />
                          {PERMISSION_LABELS[key]}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div key={cashier.id} className="flex flex-col bg-white p-3 rounded-lg border">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-medium text-sm text-slate-700">{cashier.name} <span className="ml-2 px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded">{cashier.role === 'owner' ? 'Owner' : 'Cashier'}</span></span>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-mono text-slate-500">{cashier.pin}</span>
                    <button onClick={() => generateCashierQR(cashier)} className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-full" title="Generate Login QR"><QrCode className="w-4 h-4" /></button>
                    <button onClick={() => handleEditCashier(cashier)} className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-full"><Edit2 className="w-4 h-4" /></button>
                    <button onClick={() => removeCashier(cashier.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-full"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
                {cashier.role !== 'owner' && (
                  <div className="flex flex-wrap gap-1">
                    {Object.keys(cashier.permissions || {}).filter(k => cashier.permissions[k]).map(k => (
                      <span key={k} className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-xs rounded-full">{PERMISSION_LABELS[k] || k}</span>
                    ))}
                    {Object.keys(cashier.permissions || {}).filter(k => cashier.permissions[k]).length === 0 && <span className="px-2 py-0.5 bg-slate-50 text-slate-400 text-xs rounded-full">Basic Access Only</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200"><div className="flex justify-between items-center mb-4"><h3 className="font-semibold text-slate-800 flex items-center gap-2"><Lock className="w-4 h-4 text-emerald-600" /> Owner Login</h3><button onClick={() => setShowPins(!showPins)} className="text-sm text-emerald-600 font-medium hover:underline flex items-center gap-1">{showPins ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />} {showPins ? 'Hide' : 'Show'}</button></div><div className="flex gap-2 mb-3 bg-white p-1 rounded-lg border w-fit"><button type="button" onClick={() => update('loginMode', 'pin')} className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-all ${(settings.loginMode || 'pin') === 'pin' ? 'bg-emerald-600 text-white shadow' : 'text-slate-600 hover:bg-slate-50'}`}>4-Digit PIN</button><button type="button" onClick={() => update('loginMode', 'password')} className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-all ${settings.loginMode === 'password' ? 'bg-emerald-600 text-white shadow' : 'text-slate-600 hover:bg-slate-50'}`}>Password</button></div>{(settings.loginMode || 'pin') === 'pin' ? (<div><label className="text-xs text-slate-500 font-semibold">Owner PIN (4 digits)</label><input id="field-82" name="field-82" type={showPins ? "text" : "password"} maxLength={4} className="input-field text-center font-mono tracking-widest w-1/2 mt-1" value={settings.ownerPin} onChange={e => update('ownerPin', e.target.value.replace(/\D/g, '').slice(0, 4))} /></div>) : (<div><label className="text-xs text-slate-500 font-semibold">Owner Password (min 4 chars)</label><input id="field-83" name="field-83" type={showPins ? "text" : "password"} className="input-field w-full mt-1" placeholder="Enter a strong password" value={settings.ownerPassword || ''} onChange={e => update('ownerPassword', e.target.value.slice(0, 64))} /><p className="text-xs text-slate-400 mt-2">Cashiers will continue to use their 4-digit PINs.</p></div>)}</div>
        <div className="space-y-4 pt-4 border-t border-slate-100"><div className="flex justify-between items-center"><span className="text-slate-700 font-medium">Track Expiry Dates</span><button onClick={() => { update('trackExpiry', settings.trackExpiry === false ? true : false) }} className={`w-12 h-6 rounded-full relative transition-colors ${settings.trackExpiry !== false ? 'bg-emerald-500' : 'bg-slate-200'}`}><div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${settings.trackExpiry !== false ? 'left-7' : 'left-1'}`}></div></button></div><div className="flex justify-between items-center"><span className="text-slate-700 font-medium">Show Costs & Profit</span><button onClick={() => { update('showCosts', !settings.showCosts) }} className={`w-12 h-6 rounded-full relative transition-colors ${settings.showCosts ? 'bg-emerald-500' : 'bg-slate-200'}`}><div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${settings.showCosts ? 'left-7' : 'left-1'}`}></div></button></div><div className="flex justify-between items-center"><span className="text-slate-700 font-medium">Enable Scan Features</span><button onClick={() => { update('showScan', !settings.showScan) }} className={`w-12 h-6 rounded-full relative transition-colors ${settings.showScan ? 'bg-emerald-500' : 'bg-slate-200'}`}><div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${settings.showScan ? 'left-7' : 'left-1'}`}></div></button></div><div className="flex justify-between items-center"><span className="text-slate-700 font-medium">Enable 'Scan to Sell' Button</span><button onClick={() => { update('showScanToSell', !settings.showScanToSell) }} className={`w-12 h-6 rounded-full relative transition-colors ${settings.showScanToSell ? 'bg-emerald-500' : 'bg-slate-200'}`}><div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${settings.showScanToSell ? 'left-7' : 'left-1'}`}></div></button></div>
          <div className="flex justify-between items-center pt-2 border-t border-slate-100">
            <div>
              <span className="text-slate-700 font-medium">Allow Deleting Monthly Performance History</span>
              <p className="text-xs text-slate-400 mt-0.5">When off, the "Clear Performance History" button is hidden and data is protected.</p>
            </div>
            <button onClick={() => { update('allowClearMonthlyPerf', !settings.allowClearMonthlyPerf) }} className={`w-12 h-6 rounded-full relative transition-colors flex-shrink-0 ml-4 ${settings.allowClearMonthlyPerf ? 'bg-red-500' : 'bg-slate-200'}`}><div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${settings.allowClearMonthlyPerf ? 'left-7' : 'left-1'}`}></div></button>
          </div>
          <div className="flex justify-between items-center pt-2 border-t border-slate-100">
            <div>
              <span className="text-slate-700 font-medium">Owner Notifications</span>
              <p className="text-xs text-slate-400 mt-0.5">Alerts for overdue debts, fast-selling low-stock items, and near-expiry products. Read items disappear after 3 days.</p>
            </div>
            <button onClick={() => { update('notificationsEnabled', settings.notificationsEnabled === false ? true : false) }} className={`w-12 h-6 rounded-full relative transition-colors flex-shrink-0 ml-4 ${settings.notificationsEnabled !== false ? 'bg-emerald-500' : 'bg-slate-200'}`}><div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${settings.notificationsEnabled !== false ? 'left-7' : 'left-1'}`}></div></button>
          </div>
        </div>
        <div className="pt-4 border-t border-slate-100"><div className="flex justify-between mb-3"><span className="text-sm font-medium text-slate-700">Scan Sound</span>{settings.scanSound && <button onClick={() => { update('scanSound', null) }} className="text-xs text-red-500 hover:underline flex items-center gap-1"><X className="w-3 h-3" /> Disable</button>}</div><div className="grid grid-cols-2 gap-3 mb-4">{PRESET_SOUNDS.map(s => <button key={s.id} onClick={() => { update('scanSound', s.url); new Audio(s.url).play() }} className={`p-3 text-xs border rounded-lg font-medium flex items-center gap-2 ${settings.scanSound === s.url ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'text-slate-600 hover:border-emerald-300'}`}>{settings.scanSound === s.url ? <Volume2 className="w-4 h-4" /> : <Music className="w-4 h-4 text-slate-400" />} {s.name}</button>)}</div><label className="flex items-center gap-3 p-4 border border-dashed border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors"><div className="p-2 bg-slate-100 rounded-full text-slate-500"><Upload className="w-5 h-5" /></div><div><p className="text-sm font-medium text-slate-700">Custom Sound</p><p className="text-xs text-slate-500">Upload MP3/WAV</p></div><input id="field-84" name="field-84" type="file" hidden accept="audio/*" onChange={handleSoundUpload} /></label></div>

        <div className="bg-red-50 p-4 rounded-lg border border-red-200 mt-6 pt-4 border-t">
          <h3 className="font-semibold text-red-800 flex items-center gap-2"><Trash2 className="w-4 h-4" /> Monthly Data Reset Schedule</h3>
          <p className="text-sm text-red-700 mb-4">Automatically backup and clear selected data on a specific day of the month.</p>
          <div className="flex items-center gap-3 mb-4">
            <label className="text-sm font-medium text-red-900">Reset Day (1-31):</label>
            <input id="field-85" name="field-85" type="number"
              min="1" max="31"
              className="input-field w-20 py-1"
              value={settings.autoResetDay || ''}
              onChange={e => update('autoResetDay', e.target.value ? parseInt(e.target.value) : null)}
              placeholder="e.g. 1"
            />
          </div>
          {settings.autoResetDay && (
            <div className="space-y-2 mb-4">
              <p className="text-sm font-medium text-red-900">Select data to delete automatically:</p>
              <label className="flex items-center gap-2 text-sm text-red-800">
                <input id="field-86" name="field-86" type="checkbox" checked={settings.autoResetOptions?.salesHistory || false} onChange={e => update('autoResetOptions', { ...(settings.autoResetOptions || {}), salesHistory: e.target.checked })} />
                Clear Sales History (resets Revenue & Profit)
              </label>
              <label className="flex items-center gap-2 text-sm text-red-800">
                <input id="field-87" name="field-87" type="checkbox" checked={settings.autoResetOptions?.expenses || false} onChange={e => update('autoResetOptions', { ...(settings.autoResetOptions || {}), expenses: e.target.checked })} />
                Clear Expenses
              </label>
              <label className="flex items-center gap-2 text-sm text-red-800">
                <input id="field-88" name="field-88" type="checkbox" checked={settings.autoResetOptions?.stockHistory || false} onChange={e => update('autoResetOptions', { ...(settings.autoResetOptions || {}), stockHistory: e.target.checked })} />
                Clear Stock History
              </label>
            </div>
          )}
        </div>

        <div className="pt-6 border-t">
          <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2"><Download className="w-4 h-4 text-blue-600" /> Data Import / Export</h3>
          <p className="text-sm text-slate-500 mb-4">Export all your business data to CSV for backup, or import a comprehensive CSV file.</p>
          <div className="flex gap-3">
            <button onClick={handleDownloadPdf} className="btn-primary bg-slate-700 hover:bg-slate-800 px-5 py-3 font-medium flex-1"><Download className="w-4 h-4" /> Export Full Report (PDF)</button>
            <button onClick={() => setShowFullImportModal(true)} className="btn-primary bg-blue-600 hover:bg-blue-700 px-5 py-3 font-medium flex-1"><Upload className="w-4 h-4" /> Import Full Data (CSV)</button>
          </div>
        </div>
        <ConnectDatabaseSection />
        <CloudRecoverySection />
      </div>
        {showFullImportModal && (
          <FullDataImportModal
            onClose={() => setShowFullImportModal(false)}
            updateProducts={updateProducts}
            updateSalesHistory={updateSalesHistory}
            updateExpenses={updateExpenses}
            updateDebts={updateDebts}
            updatePaidDebts={updatePaidDebts}
            updateStockHistory={updateStockHistory}
          />
        )}
        {selectedCashierQR && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
            <div style={{ background: 'white', borderRadius: 24, width: '100%', maxWidth: 400, overflow: 'hidden', boxShadow: '0 25px 60px rgba(0,0,0,0.4)' }}>
              {/* Header */}
              <div style={{ background: 'linear-gradient(135deg, #059669, #0d9488)', padding: '20px 20px 16px', textAlign: 'center', position: 'relative' }}>
                <button onClick={() => setSelectedCashierQR(null)} style={{ position: 'absolute', top: 12, right: 12, background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', width: 36, height: 36, color: 'white', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                <div style={{ fontSize: 32, marginBottom: 6 }}>📱</div>
                <div style={{ color: 'white', fontSize: 18, fontWeight: 700 }}>{selectedCashierQR.name}</div>
                <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 4 }}>Cashier Login QR Code</div>
              </div>
              {/* QR Code - large and centered */}
              <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'white' }}>
                <div style={{ background: 'white', border: '3px solid #e2e8f0', borderRadius: 16, padding: 16, display: 'inline-block', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
                  <QRCodeImage url={selectedCashierQR.qrString} size={260} />
                </div>
                <div style={{ marginTop: 16, padding: '10px 16px', background: '#f0fdf4', borderRadius: 10, border: '1px solid #bbf7d0', textAlign: 'center' }}>
                  <div style={{ fontSize: 12, color: '#166534', fontWeight: 600 }}>🔒 Encrypted with cashier's PIN</div>
                  <div style={{ fontSize: 11, color: '#4ade80', marginTop: 2 }}>QR code is safe to share</div>
                </div>
              </div>
              {/* Instructions */}
              <div style={{ padding: '0 24px 24px' }}>
                <div style={{ background: '#f8fafc', borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
                  <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 6 }}>HOW TO USE</div>
                  <div style={{ fontSize: 13, color: '#475569' }}>1. On the cashier's device, open the app</div>
                  <div style={{ fontSize: 13, color: '#475569', marginTop: 3 }}>2. Tap <strong>Scan QR Login</strong></div>
                  <div style={{ fontSize: 13, color: '#475569', marginTop: 3 }}>3. Point camera at this QR code</div>
                  <div style={{ fontSize: 13, color: '#475569', marginTop: 3 }}>4. Enter cashier's 4-digit PIN</div>
                </div>
                <button onClick={() => setSelectedCashierQR(null)} style={{ width: '100%', padding: '14px', background: '#059669', color: 'white', border: 'none', borderRadius: 12, fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>Done</button>
              </div>
            </div>
          </div>
        )}
      </div>);
    };

    // New CashierSalesHistoryPanel component
    const CashierSalesHistoryPanel = ({ salesHistory }) => {
      const [salesSearch, setSalesSearch] = useState('');
      const [salesDateRange, setSalesDateRange] = useState({ start: '', end: '' });
      const [currentPage, setCurrentPage] = useState(1);
      
      useEffect(() => { setCurrentPage(1); }, [salesSearch, salesDateRange]);

      const filterByDate = (items, dateRange) => {
        if (!dateRange.start && !dateRange.end) return items;
        const start = dateRange.start ? new Date(dateRange.start) : null;
        const end = dateRange.end ? new Date(dateRange.end) : null;
        if (start) start.setHours(0, 0, 0, 0);
        if (end) end.setHours(23, 59, 59, 999);
        return items.filter(item => {
          const itemDate = new Date(item.date);
          return (!start || itemDate >= start) && (!end || itemDate <= end);
        });
      };

      const filteredSales = useMemo(() => {
        return filterByDate([...salesHistory], salesDateRange).reverse().filter(s => (s.name || '').toLowerCase().includes(salesSearch.toLowerCase()));
      }, [salesHistory, salesDateRange, salesSearch]);

      return (
        <div className="space-y-6">
          <h2 className="text-2xl font-bold text-slate-800">Sales History</h2>
          <p className="text-slate-500 mb-6">View past sales records.</p>

          <div className="card p-0">
            <div className="p-4 border-b flex items-center gap-2 bg-slate-50 rounded-t-xl text-slate-800">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input id="field-89" name="field-89" value={salesSearch}
                  onChange={e => setSalesSearch(e.target.value)}
                  className="input-field py-1.5 pl-9 text-sm"
                  placeholder="Search product name..."
                />
              </div>
              <input id="field-90" name="field-90" type="date"
                value={salesDateRange.start}
                onChange={e => setSalesDateRange({ ...salesDateRange, start: e.target.value })}
                className="input-field py-1.5 text-sm"
              />
              <input id="field-91" name="field-91" type="date"
                value={salesDateRange.end}
                onChange={e => setSalesDateRange({ ...salesDateRange, end: e.target.value })}
                className="input-field py-1.5 text-sm"
              />
            </div>
            <div className="flex-1 overflow-auto p-4">
              <table className="w-full text-sm text-left">
                <thead className="bg-white text-slate-500 font-medium sticky top-0">
                  <tr>
                    <th className="p-3">Date & Time</th>
                    <th className="p-3">Product</th>
                    <th className="p-3">Qty</th>
                    <th className="p-3 text-right">Discount</th>
                    <th className="p-3">Cashier</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredSales.slice((currentPage - 1) * 50, currentPage * 50).map(s => (
                    <tr key={s.id} className="hover:bg-slate-50">
                      <td className="p-3 text-slate-500">{new Date(s.date).toLocaleString()}</td>
                      <td className="p-3 font-medium text-slate-800">{s.name}</td>
                      <td className="p-3">{s.quantity}</td>
                      <td className="p-3 text-right font-medium text-red-500">{s.discount?.value > 0 ? (s.discount?.type === 'percent' ? `${s.discount.value}%` : `Ksh. ${parseFloat(s.discount.value).toLocaleString()}`) : '-'}</td>
                      <td className="p-3 text-slate-500">{s.cashierName}</td>
                    </tr>
                  ))}
                  {filteredSales.length === 0 && (
                    <tr>
                      <td colSpan="5" className="p-8 text-center text-slate-400">No sales records found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
              <Pagination totalItems={filteredSales.length} itemsPerPage={50} currentPage={currentPage} setCurrentPage={setCurrentPage} />
            </div>
          </div>
        </div>
      );
    };

    // New FullDataImportModal Component for owner settings
    const FullDataImportModal = ({ onClose, updateProducts, updateSalesHistory, updateExpenses, updateDebts, updatePaidDebts, updateStockHistory }) => {
      const [text, setText] = useState('');
      const fileInputRef = useRef(null);

      const downloadTemplate = () => {
        const template = `# PRODUCTS
barcode,name,price,category,cost,stock,expiryDate
# Example: 8901234567890,Milk,75,Dairy,60,50,06/2026

# SALES_HISTORY
id,productId,name,quantity,price,cost,discountType,discountValue,finalPrice,profit,barcode,date,paymentMethod,cashierName,customerName,customerPhone
# Example: S001,P001,Milk,2,75,60,amount,0,150,30,8901234567890,2024-01-05T14:30:00.000Z,Cash,John Doe,Jane Customer,+254712345678

# EXPENSES
id,desc,amount,date
# Example: E001,Rent,10000,2024-01-01

# DEBTS
id,name,contact,product,amount,dateAdded
# Example: D001,Alice Smith,+254712312312,Sugar,500,2024-01-10

# PAID_DEBTS
id,name,contact,product,amount,dateAdded,datePaid
# Example: PD001,Alice Smith,+254712312312,Sugar,500,2024-01-10,2024-01-15

# STOCK_HISTORY
id,name,qty,barcode,date,cashierName
# Example: ST001,Milk,10,8901234567890,2024-01-02T10:00:00.000Z,Owner
`;
        const blob = new Blob([template], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.setAttribute('download', 'birku_data_template.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success('CSV Template Downloaded!');
      };

      const parseCSVData = (csvText) => {
        const sections = {
          PRODUCTS: [],
          SALES_HISTORY: [],
          EXPENSES: [],
          DEBTS: [],
          PAID_DEBTS: [],
          STOCK_HISTORY: [],
        };

        let currentSection = null;
        let headers = {};

        csvText.split('\n').forEach(line => {
          line = line.trim();
          if (line.startsWith('#')) {
            const sectionNameRaw = line.substring(1).trim();
            let sectionKey = '';
            if (sectionNameRaw === 'PRODUCTS') sectionKey = 'PRODUCTS';
            else if (sectionNameRaw === 'SALES_HISTORY') sectionKey = 'SALES_HISTORY';
            else if (sectionNameRaw === 'EXPENSES') sectionKey = 'EXPENSES';
            else if (sectionNameRaw === 'DEBTS') sectionKey = 'DEBTS';
            else if (sectionNameRaw === 'PAID_DEBTS') sectionKey = 'PAID_DEBTS';
            else if (sectionNameRaw === 'STOCK_HISTORY') sectionKey = 'STOCK_HISTORY';

            if (sectionKey && sections.hasOwnProperty(sectionKey)) {
              currentSection = sectionKey;
              headers[currentSection] = null; // Reset headers for new section
            } else {
              currentSection = null; // Reset if unknown section
            }
          } else if (currentSection && line.length > 0) {
            const parts = line.split(',');
            if (!headers[currentSection]) {
              // This is the header row for the current section
              headers[currentSection] = parts.map(h => h.trim());
            } else {
              const record = {};
              headers[currentSection].forEach((header, index) => {
                record[header] = parts[index] ? parts[index].trim() : '';
              });
              sections[currentSection].push(record);
            }
          }
        });

        const imported = {
          products: [],
          salesHistory: [],
          expenses: [],
          debts: [],
          paidDebts: [],
          stockHistory: [],
        };
        let productCount = 0;
        let salesCount = 0;
        let expenseCount = 0;
        let debtCount = 0;
        let paidDebtCount = 0;
        let stockCount = 0;

        // Process Products
        sections.PRODUCTS.forEach(p => {
          if (p.name && p.price && p.stock) {
            imported.products.push({
              id: (p && p.id) || crypto.randomUUID(),
              name: p.name,
              category: (p && p.category) || 'General',
              price: parseFloat(p.price),
              cost: parseFloat(p.cost || 0),
              stock: parseFloat(p.stock),
              barcode: p.barcode || p.arcode || undefined,
              expiryDate: p.expiryDate || p['expiry date(month/year)'] || undefined,
              dateAdded: p.dateAdded || new Date().toISOString(),
              isCommodity: p.isCommodity === 'true',
              unit: p.unit || (p.isCommodity === 'true' ? 'Kg' : undefined),
              sold: parseFloat(p.sold || 0),
              profit: parseFloat(p.profit || 0),
            });
            productCount++;
          } else {
            console.warn('Skipping malformed product record:', p);
          }
        });

        // Process Sales History
        sections.SALES_HISTORY.forEach(s => {
          if (s.id && s.productId && s.name && s.quantity && s.finalPrice && s.date) {
            imported.salesHistory.push({
              id: s.id,
              productId: s.productId,
              name: s.name,
              quantity: parseFloat(s.quantity),
              price: parseFloat(s.price || 0), // Original item price
              cost: parseFloat(s.cost || 0), // Original item cost
              discount: {
                type: s.discountType || 'amount',
                value: parseFloat(s.discountValue || 0),
              },
              finalPrice: parseFloat(s.finalPrice),
              profit: parseFloat(s.profit || 0),
              barcode: s.barcode || undefined,
              date: s.date,
              paymentMethod: s.paymentMethod || 'Unknown',
              cashierName: s.cashierName || 'N/A',
              customer: {
                name: s.customerName || '',
                phone: s.customerPhone || '',
              },
            });
            salesCount++;
          } else {
            console.warn('Skipping malformed sales history record:', s);
          }
        });

        // Process Expenses
        sections.EXPENSES.forEach(e => {
          if (e.id && e.desc && e.amount && e.date) {
            imported.expenses.push({
              id: e.id,
              desc: e.desc,
              amount: parseFloat(e.amount),
              date: e.date,
            });
            expenseCount++;
          } else {
            console.warn('Skipping malformed expense record:', e);
          }
        });

        // Process Debts
        sections.DEBTS.forEach(d => {
          if (d.id && d.name && d.amount && d.dateAdded) {
            imported.debts.push({
              id: d.id,
              name: d.name,
              contact: d.contact || '',
              product: d.product || '',
              amount: parseFloat(d.amount),
              dateAdded: d.dateAdded,
            });
            debtCount++;
          } else {
            console.warn('Skipping malformed debt record:', d);
          }
        });

        // Process Paid Debts
        sections.PAID_DEBTS.forEach(pd => {
          if (pd.id && pd.name && pd.amount && pd.dateAdded && pd.datePaid) {
            imported.paidDebts.push({
              id: pd.id,
              name: pd.name,
              contact: pd.contact || '',
              product: pd.product || '',
              amount: parseFloat(pd.amount),
              dateAdded: pd.dateAdded,
              datePaid: pd.datePaid,
            });
            paidDebtCount++;
          } else {
            console.warn('Skipping malformed paid debt record:', pd);
          }
        });

        // Process Stock History
        sections.STOCK_HISTORY.forEach(sh => {
          if (sh.id && sh.name && sh.qty && sh.date && sh.cashierName) {
            imported.stockHistory.push({
              id: sh.id,
              name: sh.name,
              qty: parseFloat(sh.qty),
              barcode: sh.barcode || undefined,
              date: sh.date,
              cashierName: sh.cashierName,
            });
            stockCount++;
          } else {
            console.warn('Skipping malformed stock history record:', sh);
          }
        });


        return { imported, counts: { productCount, salesCount, expenseCount, debtCount, paidDebtCount, stockCount } };
      };

      const handleImport = async () => {
        if (!text.trim()) {
          return toast.error('Paste CSV data or upload a file first.');
        }

        const { imported, counts } = parseCSVData(text);

        // Update stores (appending, not replacing for simplicity)
        updateProducts(prev => [...prev, ...imported.products]);
        updateSalesHistory(prev => [...prev, ...imported.salesHistory]);
        updateExpenses(prev => [...prev, ...imported.expenses]);
        updateDebts(prev => [...prev, ...imported.debts]);
        updatePaidDebts(prev => [...prev, ...imported.paidDebts]);
        updateStockHistory(prev => [...prev, ...imported.stockHistory]);

        let successMessage = 'Import Complete:';
        if (counts.productCount > 0) successMessage += ` ${counts.productCount} products,`;
        if (counts.salesCount > 0) successMessage += ` ${counts.salesCount} sales,`;
        if (counts.expenseCount > 0) successMessage += ` ${counts.expenseCount} expenses,`;
        if (counts.debtCount > 0) successMessage += ` ${counts.debtCount} debts,`;
        if (counts.paidDebtCount > 0) successMessage += ` ${counts.paidDebtCount} paid debts,`;
        if (counts.stockCount > 0) successMessage += ` ${counts.stockCount} stock movements,`;

        successMessage = successMessage.replace(/,$/, '.'); // Remove trailing comma and add period

        toast.success(successMessage, { duration: 5000 });
        onClose();
      };

      const handleFileUpload = (event) => {
        const file = event.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (e) => {
            setText(e.target.result);
            toast.success('File loaded, preview below.');
          };
          reader.readAsText(file);
        }
      };

      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-5xl h-[90vh] flex flex-col shadow-2xl relative overflow-hidden">
            <div className="p-4 border-b flex justify-between items-center bg-slate-50">
              <h3 className="font-bold flex items-center gap-2 text-slate-800"><Upload className="w-5 h-5 text-blue-600" /> Import Full Business Data (CSV)</h3>
              <button onClick={onClose}><X className="w-5 h-5 text-slate-500 hover:text-slate-800" /></button>
            </div>
            <div className="flex-1 p-6 overflow-hidden flex flex-col">
              <div className="bg-blue-50 text-blue-800 p-4 rounded-lg mb-4 text-sm border border-blue-100">
                <h4 className="font-bold mb-2">CSV Format Guide:</h4>
                <p>Paste or upload CSV data with sections for different data types. Each section should start with a comment line (e.g., <code># PRODUCTS</code>) followed by a header row and data rows.</p>
                <p className="mt-2"><strong>Supported Sections:</strong> <code># PRODUCTS</code>, <code># SALES_HISTORY</code>, <code># EXPENSES</code>, <code># DEBTS</code>, <code># PAID_DEBTS</code>, <code># STOCK_HISTORY</code>.</p>
                <p className="mt-2 text-xs">Dates should be in ISO format (e.g., <code>2024-01-01T10:00:00.000Z</code>) or <code>YYYY-MM-DD</code> for expenses/debts dates. IDs should be unique. Boolean values as <code>true</code>/<code>false</code>.</p>
              </div>

              <div className="flex flex-col md:flex-row gap-4 mb-4">
                <button onClick={downloadTemplate} className="btn-primary bg-emerald-600 hover:bg-emerald-700 py-3 px-6"><Download className="w-4 h-4" /> Download Template CSV</button>
                <label className="btn-primary bg-slate-200 hover:bg-slate-300 text-slate-800 cursor-pointer py-3 px-6">
                  <Upload className="w-4 h-4" /> Upload CSV File
                  <input id="field-92" name="field-92" type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".csv" className="hidden" />
                </label>
              </div>

              <textarea
                className="flex-1 w-full border border-slate-300 rounded-xl p-4 font-mono text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                placeholder="Paste your multi-section CSV data here..."
                value={text}
                onChange={e => setText(e.target.value)}
              ></textarea>
            </div>
            <div className="p-4 bg-slate-50 border-t flex justify-end">
              <button onClick={handleImport} className="btn-primary py-3 px-8">Import Data</button>
            </div>
          </div>
        </div>
      );
    };

    const InventoryForecastPanel = ({ products, salesHistory }) => {
      const [searchTerm, setSearchTerm] = useState('');

      const forecastData = useMemo(() => {
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        return products.map(product => {
          const productSales = salesHistory.filter(s => s.productId === product.id);

          let sales30d = 0;
          let sales7d = 0;
          let firstSaleDate = now;

          productSales.forEach(sale => {
            const saleDate = new Date(sale.date);
            if (saleDate < firstSaleDate) firstSaleDate = saleDate;
            if (saleDate >= thirtyDaysAgo) sales30d += sale.quantity;
            if (saleDate >= sevenDaysAgo) sales7d += sale.quantity;
          });

          const daysSinceFirstSale = Math.max(1, (now - firstSaleDate) / (1000 * 60 * 60 * 24));
          const confidence = daysSinceFirstSale < 30 ? 'Low' : 'High';

          const avgDailySales30d = sales30d / 30;
          const avgDailySales7d = sales7d / 7;

          const weeklyForecast = avgDailySales7d * 7;
          const monthlyForecast = avgDailySales30d * 30;

          let trend = 'Stable';
          if (avgDailySales7d > avgDailySales30d * 1.1) trend = 'Increasing';
          else if (avgDailySales7d < avgDailySales30d * 0.9) trend = 'Decreasing';

          const daysRemaining = avgDailySales30d > 0 ? Math.floor(product.stock / avgDailySales30d) : Infinity;
          const reorderQty = Math.max(0, Math.ceil(monthlyForecast - product.stock));

          return {
            ...product,
            avgDailySales: avgDailySales30d,
            weeklyForecast,
            monthlyForecast,
            daysRemaining,
            reorderQty,
            trend,
            confidence
          };
        }).filter(p => (p.name || '').toLowerCase().includes(searchTerm.toLowerCase()));
      }, [products, salesHistory, searchTerm]);

      return (
        <div className="space-y-6 pb-20">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Inventory Forecast</h2>
            <p className="text-slate-500">Business insights & stock predictions</p>
          </div>

          <div className="card p-0 overflow-hidden bg-white">
            <div className="p-4 border-b">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input id="field-93" name="field-93" className="input-field pl-10"
                  placeholder="Search products..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 border-b">
                  <tr>
                    <th className="p-4">Product Name</th>
                    <th className="p-4 text-right">Current Stock</th>
                    <th className="p-4 text-right">Avg Daily Sales</th>
                    <th className="p-4 text-right">Weekly Forecast</th>
                    <th className="p-4 text-right">Monthly Forecast</th>
                    <th className="p-4 text-right">Days Remaining</th>
                    <th className="p-4 text-right">Rec. Reorder</th>
                    <th className="p-4 text-center">Trend Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {forecastData.map(p => {
                    const isLowStock = p.daysRemaining <= 7;
                    return (
                      <tr key={(p && p.id)} className="hover:bg-slate-50">
                        <td className="p-4">
                          <div className="font-medium text-slate-800">{p.name}</div>
                          {p.confidence === 'Low' && <div className="text-[10px] text-amber-600 font-bold mt-0.5">LOW CONFIDENCE</div>}
                        </td>
                        <td className="p-4 text-right font-medium">{p.stock}</td>
                        <td className="p-4 text-right text-slate-500">{(Number() || 0).toFixed(1)}</td>
                        <td className="p-4 text-right text-slate-500">{(Number() || 0).toFixed(1)}</td>
                        <td className="p-4 text-right text-slate-500">{(Number() || 0).toFixed(1)}</td>
                        <td className="p-4 text-right">
                          {p.daysRemaining === Infinity ? (
                            <span className="text-slate-400">&infin;</span>
                          ) : (
                            <span className={`px-2 py-1 rounded-full text-xs font-bold ${isLowStock ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                              {p.daysRemaining} days
                            </span>
                          )}
                        </td>
                        <td className="p-4 text-right font-bold text-blue-600">{p.reorderQty}</td>
                        <td className="p-4 text-center">
                          {p.trend === 'Increasing' && <TrendingUp className="w-4 h-4 mx-auto text-emerald-500" title="Increasing" />}
                          {p.trend === 'Decreasing' && <TrendingDown className="w-4 h-4 mx-auto text-red-500" title="Decreasing" />}
                          {p.trend === 'Stable' && <span className="text-slate-400 font-medium">â€”</span>}
                        </td>
                      </tr>
                    );
                  })}
                  {forecastData.length === 0 && (
                    <tr><td colSpan="8" className="p-8 text-center text-slate-400">No products found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      );
    };

    // Monthly Performance Analytics Panel
    const MONTH_NAMES_GLOBAL = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const computeMonthlyAggregates = (salesHistory) => {
      const validSales = (salesHistory || []).filter(s => s.paymentMethod !== 'debt');
      if (validSales.length === 0) return [];
      const dates = validSales.map(s => new Date(s.date).getTime()).filter(t => !isNaN(t));
      if (dates.length === 0) return [];
      const minDate = new Date(dates.reduce((a, b) => Math.min(a, b), dates[0]));
      const maxDate = new Date();
      const months = [];
      let y = minDate.getFullYear(), m = minDate.getMonth();
      const endY = maxDate.getFullYear(), endM = maxDate.getMonth();
      while (y < endY || (y === endY && m <= endM)) {
        months.push({ year: y, month: m, label: `${MONTH_NAMES_GLOBAL[m]} ${y}`, profit: 0, quantity: 0, transactions: 0 });
        m++; if (m > 11) { m = 0; y++; }
      }
      validSales.forEach(s => {
        const d = new Date(s.date);
        const idx = months.findIndex(b => b.year === d.getFullYear() && b.month === d.getMonth());
        if (idx > -1) {
          months[idx].profit += s.profit || 0;
          months[idx].quantity += s.quantity || 0;
          months[idx].transactions++;
        }
      });
      return months;
    };

    const MonthlyPerformancePanel = ({ salesHistory, snapshots = [], allowClear = false, onClearSnapshots }) => {
      const [metric, setMetric] = useState('profit');
      const [viewFilter, setViewFilter] = useState('allTime');
      const [customStart, setCustomStart] = useState('');
      const [customEnd, setCustomEnd] = useState('');

      const allMonthlyBuckets = useMemo(() => {
        const live = computeMonthlyAggregates(salesHistory);
        if (live.length > 0) return live;
        return snapshots || [];
      }, [salesHistory, snapshots]);

      const monthlyData = useMemo(() => {
        let buckets = allMonthlyBuckets;
        if (viewFilter === 'thisYear') {
          const thisYear = new Date().getFullYear();
          buckets = buckets.filter(b => b.year === thisYear);
        } else if (viewFilter === 'custom' && customStart) {
          const start = new Date(customStart);
          const end = customEnd ? new Date(customEnd) : new Date();
          buckets = buckets.filter(b => {
            const bDate = new Date(b.year, b.month, 1);
            const endOfMonth = new Date(b.year, b.month + 1, 0);
            return endOfMonth >= start && bDate <= end;
          });
        }
        return buckets.map(b => ({ ...b, value: metric === 'profit' ? b.profit : b.quantity }));
      }, [allMonthlyBuckets, metric, viewFilter, customStart, customEnd]);

      const maxValue = useMemo(() => Math.max(...monthlyData.map(d => d.value), 1), [monthlyData]);

      const summaryStats = useMemo(() => {
        const totalProfit = allMonthlyBuckets.reduce((a, b) => a + b.profit, 0);
        const totalQuantity = allMonthlyBuckets.reduce((a, b) => a + b.quantity, 0);
        const monthCount = allMonthlyBuckets.length || 1;
        const nonZero = allMonthlyBuckets.filter(b => b.profit > 0 || b.quantity > 0);
        const bestMonth = allMonthlyBuckets.reduce((best, b) => !best || b.profit > best.profit ? b : best, null);
        const worstMonth = nonZero.reduce((worst, b) => !worst || b.profit < worst.profit ? b : worst, null);
        return {
          totalProfit,
          totalQuantity,
          bestMonth: bestMonth?.label || 'â€”',
          worstMonth: worstMonth?.label || 'â€”',
          avgMonthlyProfit: totalProfit / monthCount,
          avgMonthlyQuantity: totalQuantity / monthCount,
        };
      }, [allMonthlyBuckets]);

      const CustomTooltip = ({ active, payload }) => {
        if (!active || !payload || !payload.length) return null;
        const d = payload[0].payload;
        return (
          <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl text-sm border border-slate-700 min-w-[190px]">
            <p className="font-bold text-emerald-400 mb-2">{d.label}</p>
            <p className="flex justify-between gap-4"><span className="text-slate-400">Profit:</span><span className="font-semibold">Ksh {Math.round(d.profit).toLocaleString()}</span></p>
            <p className="flex justify-between gap-4"><span className="text-slate-400">Quantity Sold:</span><span className="font-semibold">{Number((Number() || 0).toFixed(1)).toLocaleString()} units</span></p>
            <p className="flex justify-between gap-4"><span className="text-slate-400">Transactions:</span><span className="font-semibold">{d.transactions}</span></p>
          </div>
        );
      };

      const formatYAxis = (v) => {
        if (metric === 'profit') {
          if (v >= 1000000) return `${(Number(v / 1000000) || 0).toFixed(1)}M`;
          if (v >= 1000) return `${(Number(v / 1000) || 0).toFixed(0)}K`;
          return v.toLocaleString();
        }
        if (v >= 1000) return `${(Number(v / 1000) || 0).toFixed(1)}K`;
        return v;
      };

      const hasData = allMonthlyBuckets.length > 0;
      const usingSnapshot = salesHistory.length === 0 && hasData;

      const chartBest = monthlyData.length > 0 ? monthlyData.reduce((b, m) => m.value > (b?.value || 0) ? m : b, null) : null;
      const chartNonZero = monthlyData.filter(m => m.value > 0);
      const chartWorst = chartNonZero.length > 0 ? chartNonZero.reduce((w, m) => m.value < (w?.value ?? Infinity) ? m : w, null) : null;

      return (
        <div className="space-y-6 pb-20">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold text-slate-800">Monthly Performance</h2>
              <p className="text-slate-500 flex items-center gap-2">
                Business performance trends since launch
                {usingSnapshot && <span className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-medium">ðŸ“¦ Showing saved history</span>}
              </p>
            </div>
            {hasData && allowClear && onClearSnapshots ? (
              <button
                onClick={() => {
                  if (confirm('This will permanently delete all saved Monthly Performance history. This cannot be undone.\n\nAre you sure?')) {
                    onClearSnapshots();
                  }
                }}
                className="flex items-center gap-1.5 text-xs text-red-600 border border-red-200 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-colors font-medium"
              >
                ðŸ—‘ Clear Performance History
              </button>
            ) : hasData ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-slate-400 border border-slate-200 bg-slate-50 px-3 py-1.5 rounded-lg font-medium cursor-not-allowed" title="Enable 'Allow Deleting Monthly Performance History' in Settings to unlock this">
                ðŸ”’ Deletion locked in Settings
              </span>
            ) : null}
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            {[
              { label: 'Total Profit Since Launch', value: `Ksh ${Math.round(summaryStats.totalProfit).toLocaleString()}`, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
              { label: 'Best Performing Month', value: summaryStats.bestMonth, color: 'text-slate-800', bg: 'bg-amber-50', border: 'border-amber-100' },
              { label: 'Worst Performing Month', value: summaryStats.worstMonth, color: 'text-slate-800', bg: 'bg-red-50', border: 'border-red-100' },
              { label: 'Total Products Sold', value: Math.round(summaryStats.totalQuantity).toLocaleString(), color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' },
              { label: 'Avg Monthly Profit', value: `Ksh ${Math.round(summaryStats.avgMonthlyProfit).toLocaleString()}`, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
              { label: 'Avg Monthly Qty Sold', value: Math.round(summaryStats.avgMonthlyQuantity).toLocaleString(), color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' },
            ].map((card, i) => (
              <div key={i} className={`p-4 rounded-xl border ${card.bg} ${card.border} shadow-sm`}>
                <p className="text-xs text-slate-500 mb-1 leading-snug">{card.label}</p>
                <p className={`text-base font-bold ${card.color} truncate`}>{card.value}</p>
              </div>
            ))}
          </div>

          {/* Chart Card */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            {/* Controls Row */}
            <div className="flex flex-col lg:flex-row justify-between gap-4 mb-6">
              {/* Metric Selector */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Performance Based On:</p>
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => setMetric('profit')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border transition-all ${metric === 'profit' ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-300 hover:text-emerald-700'}`}
                  >
                    <TrendingUp className="w-4 h-4" /> Profit (KSh)
                  </button>
                  <button
                    onClick={() => setMetric('quantity')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border transition-all ${metric === 'quantity' ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-700'}`}
                  >
                    <Package className="w-4 h-4" /> Quantity Sold (Units)
                  </button>
                </div>
              </div>

              {/* View Filter */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">View:</p>
                <div className="flex items-center gap-2 flex-wrap">
                  {[{ key: 'allTime', label: 'All Time' }, { key: 'thisYear', label: 'This Year' }, { key: 'custom', label: 'Custom Range' }].map(f => (
                    <button
                      key={f.key}
                      onClick={() => setViewFilter(f.key)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors border ${viewFilter === f.key ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                    >
                      {f.label}
                    </button>
                  ))}
                  {viewFilter === 'custom' && (
                    <div className="flex items-center gap-2 mt-1 lg:mt-0">
                      <input id="field-94" name="field-94" type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="input-field py-1.5 text-sm" />
                      <span className="text-slate-400 text-sm">â€”</span>
                      <input id="field-95" name="field-95" type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="input-field py-1.5 text-sm" />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Chart */}
            {!hasData ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                <TrendingUp className="w-16 h-16 mb-4 opacity-20" />
                <p className="text-lg font-medium text-slate-500">No sales data yet</p>
                <p className="text-sm">Complete your first sale to see monthly performance here.</p>
              </div>
            ) : monthlyData.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                <p className="text-lg font-medium">No data for selected range</p>
                <p className="text-sm">Try adjusting the date filter.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={360}>
                <BarChart data={monthlyData} margin={{ top: 10, right: 10, left: 10, bottom: monthlyData.length > 12 ? 60 : 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    tickLine={false}
                    axisLine={false}
                    angle={monthlyData.length > 12 ? -45 : 0}
                    textAnchor={monthlyData.length > 12 ? 'end' : 'middle'}
                    interval={monthlyData.length > 36 ? Math.floor(monthlyData.length / 24) : 0}
                    height={monthlyData.length > 12 ? 70 : 30}
                  />
                  <YAxis tickFormatter={formatYAxis} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} width={55} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(16,185,129,0.06)' }} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={52}>
                    {monthlyData.map((entry, index) => {
                      const isMax = entry.value === maxValue && entry.value > 0;
                      return <Cell key={`cell-${index}`} fill={isMax ? '#059669' : (metric === 'profit' ? '#10b981' : '#3b82f6')} fillOpacity={isMax ? 1 : 0.72} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}

            {/* Legend */}
            {hasData && monthlyData.length > 0 && (
              <div className="flex flex-wrap gap-x-6 gap-y-1 mt-4 text-xs text-slate-500 border-t border-slate-100 pt-4">
                {chartBest && <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm inline-block bg-emerald-600"></span> Highest {metric === 'profit' ? 'Profit' : 'Qty'}: {chartBest.label} ({metric === 'profit' ? `Ksh ${Math.round(chartBest.value).toLocaleString()}` : `${Number((Number() || 0).toFixed(0)).toLocaleString()} units`})</span>}
                {chartWorst && <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm inline-block bg-red-500"></span> Lowest {metric === 'profit' ? 'Profit' : 'Qty'}: {chartWorst.label} ({metric === 'profit' ? `Ksh ${Math.round(chartWorst.value).toLocaleString()}` : `${Number((Number() || 0).toFixed(0)).toLocaleString()} units`})</span>}
                {monthlyData.length > 0 && <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm inline-block bg-blue-500"></span> Data from {monthlyData[0]?.label} to {monthlyData[monthlyData.length - 1]?.label}</span>}
              </div>
            )}
          </div>
        </div>
      );
    };

    // ============= NOTIFICATION CENTER (Owner-only) =============
    const computeNotifications = ({ debts = [], products = [], salesHistory = [], settings = {} }) => {
      const out = [];
      const now = Date.now();
      const DAY = 86400000;
      const debtDays = Number(settings.notifyDebtDays ?? 5);
      const lowStock = Number(settings.notifyLowStock ?? 5);
      // Debts older than N days
      debts.forEach(d => {
        const ts = d.dateAdded ? new Date(d.dateAdded).getTime() : (d.timestamp || null);
        if (!ts) return;
        const days = Math.floor((now - ts) / DAY);
        if (days >= debtDays) {
          out.push({
            id: 'debt-' + d.id,
            kind: 'debt',
            title: `${d.name || 'Customer'} hasn't paid in ${days} days`,
            body: `Owes Ksh. ${Number(d.amount || 0).toLocaleString()} for ${d.product || 'items'}.`,
            ts: ts
          });
        }
      });
      // Low stock on trending products (sold in last 30 days)
      const recentMs = now - 30 * DAY;
      const soldMap = {};
      salesHistory.forEach(s => {
        const t = s.timestamp ? new Date(s.timestamp).getTime() : 0;
        if (t < recentMs) return;
        const items = s.items || (s.productName ? [{ name: s.productName, quantity: s.quantity || 1 }] : []);
        items.forEach(it => {
          const key = (it.name || '').toLowerCase();
          if (!key) return;
          soldMap[key] = (soldMap[key] || 0) + Number(it.quantity || 1);
        });
      });
      products.forEach(p => {
        const qty = soldMap[(p.name || '').toLowerCase()] || 0;
        if (qty >= 3 && p.stock <= lowStock) {
          out.push({
            id: 'lowstock-' + (p && p.id),
            kind: 'lowstock',
            title: `${p.name} is selling fast & low in stock`,
            body: `Only ${p.stock} ${p.isCommodity ? p.unit : 'left'} â€” sold ${qty} in the last 30 days.`,
            ts: now
          });
        }
      });
      // Near-expiry products (this month or next)
      products.forEach(p => {
        if (!p.expiryDate) return;
        const [y, m] = p.expiryDate.split('-').map(Number);
        if (!y || !m) return;
        const exp = new Date(y, m - 1, 1).getTime();
        const daysToExp = Math.floor((exp - now) / DAY);
        if (daysToExp <= 45) {
          out.push({
            id: 'expiry-' + (p && p.id) + '-' + p.expiryDate,
            kind: 'expiry',
            title: `${p.name} is near expiry`,
            body: `Expires ${p.expiryDate}${daysToExp < 0 ? ' (already expired)' : ` (${daysToExp} days)`}.`,
            ts: now
          });
        }
      });
      return out;
    };

    const NotificationCenter = ({ notifications, readMap, onMarkRead, onMarkAllRead, onClose, onOpenSettings }) => {
      const sorted = [...notifications].sort((a, b) => (b.ts || 0) - (a.ts || 0));
      const iconFor = (k) => k === 'debt' ? <Users className="w-4 h-4 text-rose-600" /> : k === 'lowstock' ? <Package className="w-4 h-4 text-amber-600" /> : <Calendar className="w-4 h-4 text-indigo-600" />;
      const bgFor = (k) => k === 'debt' ? 'bg-rose-50' : k === 'lowstock' ? 'bg-amber-50' : 'bg-indigo-50';
      return (
        <div className="fixed inset-0 z-[60] flex justify-end" onClick={onClose}>
          <div className="absolute inset-0 bg-black/30" />
          <aside onClick={e => e.stopPropagation()} className="relative w-96 max-w-[95%] bg-white h-full shadow-xl flex flex-col animate-in slide-in-from-right">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2"><Bell className="w-5 h-5 text-emerald-600" /><span className="font-bold text-slate-800">Notifications</span></div>
              <div className="flex items-center gap-1">
                {sorted.length > 0 && <button onClick={onMarkAllRead} className="text-xs text-emerald-600 hover:underline px-2 py-1">Mark all read</button>}
                <button onClick={onOpenSettings} title="Notification settings" className="p-1.5 rounded hover:bg-slate-100"><SettingsIcon className="w-4 h-4 text-slate-500" /></button>
                <button onClick={onClose} className="p-1.5 rounded hover:bg-slate-100"><X className="w-4 h-4 text-slate-500" /></button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-3 space-y-2">
              {sorted.length === 0 && (
                <div className="text-center text-slate-400 p-10 text-sm">You're all caught up.</div>
              )}
              {sorted.map(n => {
                const unread = !readMap[n.id];
                return (
                  <div key={n.id} className={`p-3 rounded-lg border ${unread ? 'border-emerald-200 ' + bgFor(n.kind) : 'border-slate-100 bg-white'}`}>
                    <div className="flex items-start gap-3">
                      <div className="p-1.5 bg-white rounded-md shadow-sm">{iconFor(n.kind)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-slate-800">{n.title}</div>
                        <div className="text-xs text-slate-500 mt-0.5">{n.body}</div>
                      </div>
                      {unread && <button onClick={() => onMarkRead(n.id)} title="Mark read" className="text-[10px] text-emerald-700 bg-white border border-emerald-200 rounded px-2 py-0.5 hover:bg-emerald-50">Read</button>}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="p-3 border-t border-slate-100 text-[11px] text-slate-400">Read items disappear after 3 days. Owner can disable in Settings.</div>
          </aside>
        </div>
      );
    };

    const Dashboard = ({ currentUser, onLogout, settings, onSettingsChange, initialTab = 'products', superAdminSettings, setSettingsRaw, setSuperAdminSettingsRaw }) => {
      const [tab, setTabRaw] = useState(() => {
        // Restore the last active tab from localStorage; fall back to initialTab prop
        try { return localStorage.getItem('sb_active_tab') || initialTab; } catch { return initialTab; }
      });
      // Wrap setTab so every navigation persists the chosen tab
      const setTab = (newTab) => { setTabRaw(newTab); try { localStorage.setItem('sb_active_tab', newTab); } catch {} };
      const [products, setProducts] = useState([]); const [customers, setCustomers] = useState([]); const [debts, setDebts] = useState([]); const [paidDebts, setPaidDebts] = useState([]); const [expenses, setExpenses] = useState([]); const [salesHistory, setSalesHistory] = useState([]); const [stockHistory, setStockHistory] = useState([]); const [showCalc, setShowCalc] = useState(false); const [showMenu, setShowMenu] = useState(false); const [showNotif, setShowNotif] = useState(false); const [readNotifs, setReadNotifs] = useState(() => { try { return JSON.parse(localStorage.getItem('sb_read_notifs') || '{}'); } catch { return {}; } }); const [monthlySnapshots, setMonthlySnapshots] = useState([]); const [cart, setCart] = useState([]);
      const [receiptData, setReceiptData] = useState(null);
      const [showPrintModal, setShowPrintModal] = useState(false);

      // Notifications: compute live + auto-purge read entries after 3 days
      const notifications = React.useMemo(() => computeNotifications({ debts, products, salesHistory, settings }), [debts, products, salesHistory, settings]);
      React.useEffect(() => {
        const cutoff = Date.now() - 3 * 86400000;
        const cleaned = {};
        const validIds = new Set(notifications.map(n => n.id));
        Object.entries(readNotifs).forEach(([id, ts]) => { if (ts > cutoff && validIds.has(id)) cleaned[id] = ts; });
        if (Object.keys(cleaned).length !== Object.keys(readNotifs).length) {
          setReadNotifs(cleaned);
        }
        localStorage.setItem('sb_read_notifs', JSON.stringify(cleaned));
      }, [notifications]);
      const visibleNotifs = notifications.filter(n => !readNotifs[n.id]);
      const unreadNotifCount = visibleNotifs.length;
      const markNotifRead = (id) => setReadNotifs(prev => ({ ...prev, [id]: Date.now() }));
      const markAllNotifRead = () => { const m = { ...readNotifs }; const now = Date.now(); notifications.forEach(n => { m[n.id] = now; }); setReadNotifs(m); };
      
      const updateProducts = (newData) => { setProducts(newData); saveDataToDB('products', newData); tursoSync('products', newData); }; const updateCustomers = (newData) => { setCustomers(newData); saveDataToDB('customers', newData); tursoSync('customers', newData); }; const updateDebts = (newData) => { setDebts(newData); saveDataToDB('debts', newData); tursoSync('debts', newData); }; const updatePaidDebts = (newData) => { setPaidDebts(newData); saveDataToDB('paidDebts', newData); tursoSync('paidDebts', newData); }; const updateExpenses = (newData) => { setExpenses(newData); saveDataToDB('expenses', newData); tursoSync('expenses', newData); }; const updateSalesHistory = (newData) => { setSalesHistory(newData); saveDataToDB('salesHistory', newData); tursoSync('salesHistory', newData); const snaps = computeMonthlyAggregates(newData); if (snaps.length > 0) { saveMonthlySnapshots(snaps).then(() => setMonthlySnapshots(snaps)); } }; const updateStockHistory = (newData) => { setStockHistory(newData); saveDataToDB('stockHistory', newData); tursoSync('stockHistory', newData); };

      useEffect(() => { const loadAllData = async () => { const loadedProducts = (await loadDataFromDB('products') || []).filter(Boolean); const loadedCustomers = (await loadDataFromDB('customers') || []).filter(Boolean); const loadedDebts = (await loadDataFromDB('debts') || []).filter(Boolean); const loadedPaidDebts = (await loadDataFromDB('paidDebts') || []).filter(Boolean); const loadedExpenses = (await loadDataFromDB('expenses') || []).filter(Boolean); const loadedSales = (await loadDataFromDB('salesHistory') || []).filter(Boolean); const loadedStock = (await loadDataFromDB('stockHistory') || []).filter(Boolean); const loadedSnaps = (await loadMonthlySnapshots() || []).filter(Boolean); setProducts(loadedProducts); setCustomers(loadedCustomers); setDebts(loadedDebts); setPaidDebts(loadedPaidDebts); setExpenses(loadedExpenses); setSalesHistory(loadedSales); setStockHistory(loadedStock); setMonthlySnapshots(loadedSnaps); }; loadAllData(); }, []);

      // ── Real-time sync: poll Turso every 5s for changes made on other devices ──
      const lastSyncTsRef = useRef(0);
      useEffect(() => {

        const applyLiveData = async (data) => {
          // Update React state AND local IndexedDB with the new data from Turso
          if (data.settings && !Array.isArray(data.settings))   { if (setSettingsRaw) setSettingsRaw({ ...DEFAULT_SETTINGS, ...data.settings }); await saveDataToDB('settings', data.settings); }
          if (data.superAdminSettings && !Array.isArray(data.superAdminSettings)) { if (setSuperAdminSettingsRaw) setSuperAdminSettingsRaw({ ...DEFAULT_SUPER_ADMIN_SETTINGS, ...data.superAdminSettings }); await saveDataToDB('superAdminSettings', data.superAdminSettings); }
          if (Array.isArray(data.products))     { const v = data.products.filter(Boolean); setProducts(v);         await saveDataToDB('products', v); }
          if (Array.isArray(data.salesHistory)) { const v = data.salesHistory.filter(Boolean); setSalesHistory(v);  await saveDataToDB('salesHistory', v); const snaps = computeMonthlyAggregates(v); if (snaps.length > 0) { saveMonthlySnapshots(snaps).then(() => setMonthlySnapshots(snaps)); } }
          if (Array.isArray(data.customers))    { const v = data.customers.filter(Boolean); setCustomers(v);         await saveDataToDB('customers', v); }
          if (Array.isArray(data.debts))        { const v = data.debts.filter(Boolean); setDebts(v);                 await saveDataToDB('debts', v); }
          if (Array.isArray(data.paidDebts))    { const v = data.paidDebts.filter(Boolean); setPaidDebts(v);         await saveDataToDB('paidDebts', v); }
          if (Array.isArray(data.expenses))     { const v = data.expenses.filter(Boolean); setExpenses(v);           await saveDataToDB('expenses', v); }
          if (Array.isArray(data.stockHistory)) { const v = data.stockHistory.filter(Boolean); setStockHistory(v);   await saveDataToDB('stockHistory', v); }
        };

        const interval = setInterval(async () => {
          try {
            // Step 1: cheap poll — just get the timestamp
            const pollRes = await fetch('/api/poll', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({}),
            });
            if (!pollRes.ok) return;
            const { last_modified } = await pollRes.json();
            if (!last_modified) return;

            // Step 2: skip if we have never synced yet (first poll, set baseline)
            if (lastSyncTsRef.current === 0) {
              lastSyncTsRef.current = last_modified;
              return;
            }

            // Step 3: if remote is newer than what we last saw, check if WE caused the change
            if (last_modified > lastSyncTsRef.current) {
              if (localStorage.getItem('has_pending_sync') === 'true') {
                await tursoSyncAll();
                return;
              }
              // Grace period: if this device wrote within the last 3 seconds, skip (it's our own write)
              const lastLocalWrite = Number(sessionStorage.getItem('sb_last_local_write') || 0);
              const msSinceLocalWrite = Date.now() - lastLocalWrite;
              lastSyncTsRef.current = last_modified;
              if (msSinceLocalWrite < 3000) return; // Our own write — skip

              // Pull fresh data and apply directly to React state
              const pullRes = await fetch('/api/pull', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: httpUrl, token }),
              });
              const result = await pullRes.json();
              if (result.ok && result.data) {
                await applyLiveData(result.data);
                toast.success('🔄 Synced from another device', { duration: 2000, id: 'live-sync' });
              }
            }
          } catch (_) { /* Silent — never crash the POS */ }
        }, 5000);

        return () => clearInterval(interval);
      }, []);
      useEffect(() => {
        if (products.length > 0 && !sessionStorage.getItem('expiryReminderShown')) {
          const today = new Date();
          const nextWeek = new Date();
          nextWeek.setDate(today.getDate() + 7);
          const expiring = products.filter(p => {
             if (!p.expiryDate) return false;
             let d;
             if (p.expiryDate.includes('/')) {
                const parts = p.expiryDate.split('/');
                d = new Date(parts[1], parseInt(parts[0]) - 1, 28);
             } else {
                d = new Date(p.expiryDate);
             }
             return d <= nextWeek && d >= today;
          });
          if (expiring.length > 0) {
             toast(`Reminder: ${expiring.length} product(s) expiring within 7 days. Check 'Expiring Soon' tab.`, { duration: 8000, icon: 'âš ï¸' });
             sessionStorage.setItem('expiryReminderShown', 'true');
          }
        }
      }, [products]);


      useEffect(() => {
        if (!settings.autoResetDay || !salesHistory.length) return;

        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();
        let resetDate = new Date(currentYear, currentMonth, settings.autoResetDay);
        if (resetDate.getMonth() !== currentMonth) {
          resetDate = new Date(currentYear, currentMonth + 1, 0);
        }

        if (now >= resetDate) {
          const lastReset = settings.lastAutoResetDate ? new Date(settings.lastAutoResetDate) : null;
          if (!lastReset || lastReset.getMonth() !== currentMonth || lastReset.getFullYear() !== currentYear) {

            // Generate PDF before resetting
            const doc = new jsPDF('landscape');
            const today = new Date().toLocaleDateString('en-GB');

            doc.setFontSize(20);
            doc.text(settings.name || 'Business Report', 14, 22);
            doc.setFontSize(12);
            doc.text(`Auto-Backup Report - ${today}`, 14, 30);

            doc.setFontSize(10);
            doc.text(`Total Revenue: Ksh. ${salesHistory.reduce((a, b) => a + (b.finalPrice || b.price * b.quantity), 0).toLocaleString()}`, 14, 40);
            doc.text(`Net Profit: Ksh. ${((salesHistory.reduce((a, b) => a + b.profit, 0)) - (expenses.reduce((a, b) => a + b.amount, 0))).toLocaleString()}`, 14, 45);
            doc.text(`Total Expenses: Ksh. ${expenses.reduce((a, b) => a + b.amount, 0).toLocaleString()}`, 14, 50);
            doc.text(`Pending Debts: Ksh. ${debts.reduce((a, b) => a + b.amount, 0).toLocaleString()}`, 14, 55);

            autoTable(doc, { startY: 65, head: [['Barcode', 'Name', 'Price', 'Category', 'Cost', 'Stock', 'Expiry Date']], body: products.map(p => [p.barcode || '-', p.name, p.price, (p && p.category), p.cost, p.stock, p.expiryDate || '-']), headStyles: { fillColor: '#059669' } });
            autoTable(doc, { head: [['Date', 'Product', 'Qty', 'Total', 'Cashier']], body: salesHistory.map(s => [new Date(s.date).toLocaleDateString(), s.name, s.quantity, s.finalPrice, s.cashierName]), headStyles: { fillColor: '#059669' } });
            autoTable(doc, { head: [['Date', 'Description', 'Amount']], body: expenses.map(e => [e.date, e.desc, e.amount]), headStyles: { fillColor: '#059669' } });
            autoTable(doc, { head: [['Date', 'Customer', 'Items', 'Amount']], body: debts.map(d => [d.dateAdded, d.name, d.product, d.amount]), headStyles: { fillColor: '#059669' } });

            doc.save(`AutoBackup_Report_${new Date().toISOString().split('T')[0]}.pdf`);

            // Perform Resets
            if (settings.autoResetOptions?.salesHistory) updateSalesHistory([]);
            if (settings.autoResetOptions?.expenses) updateExpenses([]);
            if (settings.autoResetOptions?.stockHistory) updateStockHistory([]);

            onSettingsChange({ ...settings, lastAutoResetDate: now.toISOString() });
            toast.info('Monthly data backup and reset completed automatically.', { duration: 6000 });
          }
        }
      }, [settings.autoResetDay, settings.autoResetOptions, settings.lastAutoResetDate, salesHistory.length, expenses.length, debts.length, products.length]);

      const effectiveCurrentUser = useMemo(() => {
        if (!currentUser) return null;
        if (currentUser.role === 'owner') {
          return { role: 'owner', name: currentUser.name || settings.ownerName || 'Owner' };
        }
        if (currentUser.role === 'cashier') {
          const cashierDetails = (settings.cashiers || []).find(c => c.id === currentUser.id);
          return { ...currentUser, name: cashierDetails?.name || 'Cashier', permissions: cashierDetails?.permissions || {} };
        }
        return currentUser;
      }, [currentUser, settings.cashiers]);
      const notifEnabled = settings.notificationsEnabled !== false && effectiveCurrentUser?.role === 'owner';

      const canView = (t) => {
        if (effectiveCurrentUser?.role === 'owner') {
          if (t === 'stockHistory') return false;
          return true;
        }
        if (t === 'products' || t === 'cashierSalesHistory') return true;
        const perms = effectiveCurrentUser?.permissions || {};
        if (t === 'customers') return !!perms.viewCustomers;
        if (t === 'debts') return !!perms.viewDebts;
        if (t === 'expenses') return !!perms.viewExpenses;
        if (t === 'stockHistory') return !!perms.viewStockHistory;
        if (t === 'suppliers') return !!perms.viewSuppliers;
        return false;
      };

      const printData = (saleDetails) => {
        setReceiptData(saleDetails);
        setShowPrintModal(true);
      };

      const handleCancelSale = (saleId) => {
        if (!confirm('Are you sure you want to cancel this sale? This will return the items to stock and cannot be undone.')) {
          return;
        }

        const saleToCancel = salesHistory.find(s => s.id === saleId);

        if (!saleToCancel) {
          return toast.error('Sale not found.');
        }

        if (saleToCancel.paymentMethod === 'debt') {
          return toast.error('Debt records must be managed from the Debts panel.');
        }

        // Update product stock if product still exists
        const productToRestock = products.find(p => (p && p.id) === saleToCancel.productId);
        if (productToRestock) {
          const updatedProducts = products.map(p =>
            (p && p.id) === saleToCancel.productId
              ? { ...p, stock: p.stock + saleToCancel.quantity }
              : p
          );
          updateProducts(updatedProducts);
        } else {
          toast.warn(`Product "${saleToCancel.name}" no longer exists. Stock cannot be restored.`);
        }

        // Remove sale from history
        const updatedSalesHistory = salesHistory.filter(s => s.id !== saleId);
        updateSalesHistory(updatedSalesHistory);

        toast.success('Sale cancelled successfully.');
      };

      const processSale = async (saleDetails) => {
        const { cart, payment, totals } = saleDetails;
        let tempProducts = [...products];
        let newSales = [];

        // 1. Stock Validation (Aggregate)
        const quantitiesNeeded = {};
        cart.forEach(item => {
          quantitiesNeeded[item.productId] = (quantitiesNeeded[item.productId] || 0) + item.quantity;
        });
        for (const [prodId, qty] of Object.entries(quantitiesNeeded)) {
          const product = tempProducts.find(p => (p && p.id) === prodId);
          if (!product) return toast.error("Product not found");
          if (product.stock < qty) return toast.error(`Not enough stock for ${product.name}. Need ${qty}, have ${product.stock}`);
        }

        // 2. Process Sales Sequentially
        cart.forEach(item => {
          const pIndex = tempProducts.findIndex(p => (p && p.id) === item.productId);
          const p = tempProducts[pIndex];

          const itemTotal = item.price * item.quantity;
          const discount = item.discountType === 'percent' ? itemTotal * (item.discountValue / 100) : item.discountValue;
          const finalPrice = itemTotal - discount;
          const profit = finalPrice - (p.cost * item.quantity);

          tempProducts[pIndex] = {
            ...p,
            stock: p.stock - item.quantity,
            sold: (p.sold || 0) + item.quantity,
            profit: (p.profit || 0) + profit
          };

          newSales.push({
            id: 'sale_' + Date.now() + '_' + item.cartId,
            productId: (p && p.id),
            name: p.name,
            quantity: item.quantity,
            price: p.price,
            cost: p.cost,
            discount: { type: item.discountType, value: item.discountValue },
            finalPrice,
            profit,
            barcode: p.barcode,
            date: new Date().toISOString(),
            paymentMethod: payment.method,
            cashierName: effectiveCurrentUser?.name,
            customer: saleDetails.customer
          });
        });

        updateProducts(tempProducts);
        updateSalesHistory([...salesHistory, ...newSales]);
        if (settings.scanSound) new Audio(settings.scanSound).play().catch(() => { });

        // Send data to Google Sheets
        const transactionRecord = {
          date: new Date().toISOString(),
          invoiceId: `INV-${Date.now()}`,
          total: totals.grandTotal,
          paymentMethod: payment.method,
          items: cart.map(item => `${item.name} (${item.quantity})`).join(', '),
          cashier: effectiveCurrentUser?.name || 'Unknown'
        };

        if (transactionRecord) {
          await syncToGoogleSheets(transactionRecord);
        }

        let successMsg = `Sold items.`;
        if (payment.method === 'Cash' && payment.change > 0) { successMsg += ` Change: Ksh. ${payment.change.toLocaleString()}`; }
        toast.success(successMsg, { duration: 4000 });
      };

      const generatePDF = () => {
        const doc = new jsPDF('landscape');
        const today = new Date().toLocaleDateString('en-GB');

        doc.setFontSize(20);
        doc.text(settings.name, 14, 22);
        doc.setFontSize(12);
        doc.text(`Business Report - ${today}`, 14, 30);

        doc.setFontSize(10);
        doc.text(`Total Revenue: Ksh. ${salesHistory.reduce((a, b) => a + (b.finalPrice || b.price * b.quantity), 0).toLocaleString()}`, 14, 40);
        doc.text(`Net Profit: Ksh. ${((salesHistory.reduce((a, b) => a + b.profit, 0)) - (expenses.reduce((a, b) => a + b.amount, 0))).toLocaleString()}`, 14, 45);
        doc.text(`Total Expenses: Ksh. ${expenses.reduce((a, b) => a + b.amount, 0).toLocaleString()}`, 14, 50);
        doc.text(`Pending Debts: Ksh. ${debts.reduce((a, b) => a + b.amount, 0).toLocaleString()}`, 14, 55);

        autoTable(doc, { startY: 65, head: [['Barcode', 'Name', 'Price', 'Category', 'Cost', 'Stock', 'Expiry Date']], body: products.map(p => [p.barcode || '-', p.name, p.price, (p && p.category), p.cost, p.stock, p.expiryDate || '-']), headStyles: { fillColor: '#059669' } });
        autoTable(doc, { head: [['Date', 'Product', 'Qty', 'Total', 'Cashier']], body: salesHistory.map(s => [new Date(s.date).toLocaleDateString(), s.name, s.quantity, s.finalPrice, s.cashierName]), headStyles: { fillColor: '#059669' } });
        autoTable(doc, { head: [['Date', 'Description', 'Amount']], body: expenses.map(e => [e.date, e.desc, e.amount]), headStyles: { fillColor: '#059669' } });
        autoTable(doc, { head: [['Date', 'Customer', 'Items', 'Amount']], body: debts.map(d => [d.dateAdded, d.name, d.product, d.amount]), headStyles: { fillColor: '#059669' } });

        doc.save(`SoftlyBuilt_Report_${new Date().toISOString().split('T')[0]}.pdf`);
      };

      const handleDownloadPdf = () => {
        generatePDF();
        localStorage.setItem('lastPdfDownloadDate', new Date().toISOString().split('T')[0]);
        toast.success('Report downloaded!');
      };

      const renderTab = () => {
        const props = { settings, setSettings: onSettingsChange, superAdminSettings, products, setProducts: updateProducts, customers, setCustomers: updateCustomers, debts, setDebts: updateDebts, paidDebts, setPaidDebts: updatePaidDebts, expenses, setExpenses: updateExpenses, salesHistory, setSalesHistory: updateSalesHistory, stockHistory, setStockHistory: updateStockHistory, currentUser: effectiveCurrentUser, processSale, printData, suppliers: settings.suppliers, updateCustomers, cart, setCart };
        if (tab === 'products') return <ErrorBoundary><ProductPanel {...props} /></ErrorBoundary>;
        if (tab === 'customers') return <CustomerPanel {...props} />;
        if (tab === 'debts') return <DebtPanel {...props} />;
        if (tab === 'expenses') return <ExpensePanel {...props} />;
        if (tab === 'summary' && effectiveCurrentUser?.role === 'owner') return <SummaryPanel {...props} onCancelSale={handleCancelSale} />;
        if (tab === 'forecast' && effectiveCurrentUser?.role === 'owner') return <InventoryForecastPanel {...props} />;
        if (tab === 'monthlyPerformance' && effectiveCurrentUser?.role === 'owner') return <MonthlyPerformancePanel salesHistory={salesHistory} snapshots={monthlySnapshots} allowClear={!!settings.allowClearMonthlyPerf} onClearSnapshots={async () => { await clearMonthlySnapshots(); setMonthlySnapshots([]); }} />;
        if (tab === 'cashierSalesHistory' && effectiveCurrentUser?.role === 'cashier') return <CashierSalesHistoryPanel {...props} />;
        if (tab === 'cashierSettings' && effectiveCurrentUser?.role === 'cashier') return <CashierSettingsPanel currentUser={effectiveCurrentUser} settings={settings} setSettings={onSettingsChange} />;
        if (tab === 'settings' && effectiveCurrentUser?.role === 'owner') return <SettingsPanel {...props} updateProducts={updateProducts} updateSalesHistory={updateSalesHistory} updateExpenses={updateExpenses} updateDebts={updateDebts} updatePaidDebts={updatePaidDebts} updateStockHistory={updateStockHistory} handleDownloadPdf={handleDownloadPdf} />;
        if (tab === 'suppliers' && canView('suppliers')) return <SupplierPanel {...props} />;
        if (tab === 'stockHistory' && canView('stockHistory')) return <StockHistoryPanel stockHistory={stockHistory} />;
        if (tab === 'staffProfiles' && effectiveCurrentUser?.role === 'owner') return <StaffProfilesPanel users={[{name: 'Owner', role: 'owner'}, ...(settings.cashiers || []).map(c => ({name: c.name, role: c.role || 'cashier'}))]} salesHistory={salesHistory} stockHistory={stockHistory} expenses={expenses} products={products} customers={customers} />;
        return null;
      };

      if (!effectiveCurrentUser) return null;

      return (<div className="flex h-screen bg-slate-50">
        <aside className="w-64 bg-white border-r border-slate-200 hidden md:flex flex-col z-10">
          <div className="p-6 border-b border-slate-100"><div className="flex items-center gap-2 mb-1"><img src={window.LOGO_DATA} alt="Softly Built" className="w-8 h-8 rounded-lg object-contain shadow-md shadow-emerald-200" /><span className="font-bold text-lg text-slate-800">Softly Built</span></div><div className="text-xs text-slate-500 font-medium truncate">{settings.name}</div><div className={`mt-3 text-xs px-3 py-1.5 rounded-full inline-flex items-center gap-1.5 font-bold ${effectiveCurrentUser?.role === 'owner' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}><ShieldCheck className="w-3 h-3" /> {effectiveCurrentUser?.name}</div></div>
          <nav className="flex-1 p-4 space-y-1">
            <button onClick={() => setTab('products')} className={`flex items-center gap-3 w-full p-3 rounded-lg font-medium transition-colors ${tab === 'products' ? 'bg-emerald-50 text-emerald-700 shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}><Package className="w-5 h-5" /> Products</button>
            {canView('customers') && <button onClick={() => setTab('customers')} className={`flex items-center gap-3 w-full p-3 rounded-lg font-medium transition-colors ${tab === 'customers' ? 'bg-emerald-50 text-emerald-700 shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}><UserPlus className="w-5 h-5" /> Customers</button>}
            {canView('debts') && <button onClick={() => setTab('debts')} className={`flex items-center gap-3 w-full p-3 rounded-lg font-medium transition-colors ${tab === 'debts' ? 'bg-emerald-50 text-emerald-700 shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}><Users className="w-5 h-5" /> Debts</button>}
            {canView('expenses') && <button onClick={() => setTab('expenses')} className={`flex items-center gap-3 w-full p-3 rounded-lg font-medium transition-colors ${tab === 'expenses' ? 'bg-emerald-50 text-emerald-700 shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}><DollarSign className="w-5 h-5" /> Expenses</button>}
            {canView('suppliers') && <button onClick={() => setTab('suppliers')} className={`flex items-center gap-3 w-full p-3 rounded-lg font-medium transition-colors ${tab === 'suppliers' ? 'bg-emerald-50 text-emerald-700 shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}><Truck className="w-5 h-5" /> Suppliers</button>}
            {canView('stockHistory') && <button onClick={() => setTab('stockHistory')} className={`flex items-center gap-3 w-full p-3 rounded-lg font-medium transition-colors ${tab === 'stockHistory' ? 'bg-emerald-50 text-emerald-700 shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}><ClipboardList className="w-5 h-5" /> Stock History</button>}
            {effectiveCurrentUser?.role === 'owner' && <button onClick={() => setTab('summary')} className={`flex items-center gap-3 w-full p-3 rounded-lg font-medium transition-colors ${tab === 'summary' ? 'bg-emerald-50 text-emerald-700 shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}><PieChart className="w-5 h-5" /> Analytics</button>}
            {effectiveCurrentUser?.role === 'owner' && <button onClick={() => setTab('forecast')} className={`flex items-center gap-3 w-full p-3 rounded-lg font-medium transition-colors ${tab === 'forecast' ? 'bg-emerald-50 text-emerald-700 shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}><TrendingUp className="w-5 h-5" /> Forecast</button>}
            {effectiveCurrentUser?.role === 'owner' && <button onClick={() => setTab('staffProfiles')} className={`flex items-center gap-3 w-full p-3 rounded-lg font-medium transition-colors ${tab === 'staffProfiles' ? 'bg-emerald-50 text-emerald-700 shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}><Users className="w-5 h-5" /> Staff Profiles</button>}
            {effectiveCurrentUser?.role === 'owner' && <button onClick={() => setTab('monthlyPerformance')} className={`flex items-center gap-3 w-full p-3 rounded-lg font-medium transition-colors ${tab === 'monthlyPerformance' ? 'bg-emerald-50 text-emerald-700 shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}><BarChart className="w-5 h-5" /> Monthly Performance</button>}
            {effectiveCurrentUser?.role === 'cashier' && <button onClick={() => setTab('cashierSalesHistory')} className={`flex items-center gap-3 w-full p-3 rounded-lg font-medium transition-colors ${tab === 'cashierSalesHistory' ? 'bg-emerald-50 text-emerald-700 shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}><FileText className="w-5 h-5" /> Sales History</button>}
            {effectiveCurrentUser?.role === 'owner' && <button onClick={() => setTab('settings')} className={`flex items-center gap-3 w-full p-3 rounded-lg font-medium transition-colors ${tab === 'settings' ? 'bg-emerald-50 text-emerald-700 shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}><SettingsIcon className="w-5 h-5" /> Settings</button>}
            {effectiveCurrentUser?.role === 'cashier' && <button onClick={() => setTab('cashierSettings')} className={`flex items-center gap-3 w-full p-3 rounded-lg font-medium transition-colors ${tab === 'cashierSettings' ? 'bg-emerald-50 text-emerald-700 shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}><SettingsIcon className="w-5 h-5" /> Settings</button>}
          </nav>
          <div className="p-4 border-t border-slate-100 space-y-2">{notifEnabled && <button onClick={() => setShowNotif(true)} className="flex items-center gap-3 w-full p-3 text-slate-500 hover:bg-slate-50 hover:text-slate-800 rounded-lg transition-colors relative"><Bell className="w-5 h-5" /> Notifications {unreadNotifCount > 0 && <span className="ml-auto bg-rose-500 text-white text-[10px] font-bold rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center">{unreadNotifCount}</span>}</button>}<button onClick={() => setShowCalc(!showCalc)} className="flex items-center gap-3 w-full p-3 text-slate-500 hover:bg-slate-50 hover:text-slate-800 rounded-lg transition-colors"><CalcIcon className="w-5 h-5" /> Calculator</button><button onClick={onLogout} className="flex items-center gap-3 w-full p-3 text-red-500 hover:bg-red-50 rounded-lg mt-1 transition-colors"><LogOut className="w-5 h-5" /> Logout</button></div>
        </aside>
        <div className="md:hidden fixed bottom-0 left-0 right-0 w-full bg-white border-t border-slate-200 flex justify-around p-2 z-40 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">{['products', 'customers', 'debts', 'expenses', 'summary', 'settings'].map(t => canView(t) && (<button key={t} onClick={() => setTab(t)} className={`p-2 rounded-lg ${tab === t ? 'text-emerald-600 bg-emerald-50' : 'text-slate-400'}`}>
          {t === 'products' ? <Package className="w-6 h-6" /> :
            t === 'customers' ? <UserPlus className="w-6 h-6" /> :
              t === 'debts' ? <Users className="w-6 h-6" /> :
                t === 'expenses' ? <DollarSign className="w-6 h-6" /> :
                  t === 'suppliers' ? <Truck className="w-6 h-6" /> :
                    t === 'stockHistory' ? <ClipboardList className="w-6 h-6" /> :
                      t === 'summary' ? <PieChart className="w-6 h-6" /> :
                        t === 'forecast' ? <TrendingUp className="w-6 h-6" /> :
                          t === 'monthlyPerformance' ? <BarChart className="w-6 h-6" /> :
                            t === 'cashierSalesHistory' ? <FileText className="w-6 h-6" /> :
                              <SettingsIcon className="w-6 h-6" />}<span style={{fontSize:"10px",marginTop:"2px",fontWeight:600}}>{({products:"Products",customers:"Customers",debts:"Debts",expenses:"Expenses",suppliers:"Suppliers",stockHistory:"Stock",summary:"Reports",forecast:"Forecast",monthlyPerformance:"Monthly",cashierSalesHistory:"Sales",settings:"Settings",cashierSettings:"Settings"})[t]}</span>
        </button>))}</div>
        {showMenu && (
          <div className="fixed inset-0 z-50 flex" onClick={() => setShowMenu(false)}>
            <div className="absolute inset-0 bg-black/40" />
            <aside onClick={e => e.stopPropagation()} className="relative w-72 max-w-[85%] bg-white h-full shadow-xl flex flex-col animate-in slide-in-from-left">
              <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2"><img src={window.LOGO_DATA} alt="" className="w-8 h-8 rounded-lg object-contain" /><span className="font-bold text-slate-800">Softly Built</span></div>
                <button onClick={() => setShowMenu(false)} className="p-1.5 rounded hover:bg-slate-100"><X className="w-5 h-5 text-slate-500" /></button>
              </div>
              <nav className="flex-1 p-4 space-y-1 overflow-auto">
                {[
                  {k:'products', label:'Products', Icon: Package},
                  {k:'customers', label:'Customers', Icon: UserPlus},
                  {k:'debts', label:'Debts', Icon: Users},
                  {k:'expenses', label:'Expenses', Icon: DollarSign},
                  {k:'suppliers', label:'Suppliers', Icon: Truck},
                  {k:'stockHistory', label:'Stock History', Icon: ClipboardList},
                  {k:'summary', label:'Analytics', Icon: PieChart, ownerOnly:true},
                  {k:'forecast', label:'Forecast', Icon: TrendingUp, ownerOnly:true},
                  {k:'staffProfiles', label:'Staff Profiles', Icon: Users, ownerOnly:true},
                  {k:'monthlyPerformance', label:'Monthly Performance', Icon: BarChart, ownerOnly:true},
                  {k:'cashierSalesHistory', label:'Sales History', Icon: FileText, cashierOnly:true},
                  {k:'settings', label:'Settings', Icon: SettingsIcon, ownerOnly:true},
                  {k:'cashierSettings', label:'Settings', Icon: SettingsIcon, cashierOnly:true},
                ].filter(it => {
                  if (it.ownerOnly) return effectiveCurrentUser?.role === 'owner';
                  if (it.cashierOnly) return effectiveCurrentUser?.role === 'cashier';
                  return canView(it.k);
                }).map(({k,label,Icon}) => (
                  <button key={k} onClick={() => { setTab(k); setShowMenu(false); }} className={`flex items-center gap-3 w-full p-3 rounded-lg font-medium transition-colors ${tab === k ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-50'}`}><Icon className="w-5 h-5" /> {label}</button>
                ))}
              </nav>
              <div className="p-4 border-t border-slate-100 space-y-1">
                {notifEnabled && <button onClick={() => { setShowNotif(true); setShowMenu(false); }} className="flex items-center gap-3 w-full p-3 text-slate-500 hover:bg-slate-50 rounded-lg relative"><Bell className="w-5 h-5" /> Notifications {unreadNotifCount > 0 && <span className="ml-auto bg-rose-500 text-white text-[10px] font-bold rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center">{unreadNotifCount}</span>}</button>}<button onClick={() => { setShowCalc(!showCalc); setShowMenu(false); }} className="flex items-center gap-3 w-full p-3 text-slate-500 hover:bg-slate-50 rounded-lg"><CalcIcon className="w-5 h-5" /> Calculator</button>
                <button onClick={async () => { toast.loading("Syncing...",{id:'sync'}); const p = await tursoPullAll(); if(p){ sessionStorage.setItem('just_pulled','true'); window.location.reload(); } else { toast.success("Up to date",{id:'sync'}); } }} className="flex items-center gap-3 w-full p-3 text-emerald-600 hover:bg-emerald-50 rounded-lg"><RefreshCw className="w-5 h-5" /> Sync Data</button>
                <button onClick={onLogout} className="flex items-center gap-3 w-full p-3 text-red-500 hover:bg-red-50 rounded-lg"><LogOut className="w-5 h-5" /> Logout</button>
              </div>
            </aside>
          </div>
        )}
        <main className="flex-1 overflow-auto p-4 md:p-8 relative">
          <header className="flex justify-between items-center mb-6"><div className="font-bold text-lg flex items-center gap-2 text-slate-800"><button onClick={() => setShowMenu(true)} className="p-2 bg-white rounded shadow text-slate-600 hover:bg-slate-50" aria-label="Open menu"><Menu className="w-5 h-5" /></button><img src={window.LOGO_DATA} alt="Softly Built" className="w-8 h-8 rounded object-contain md:hidden" /> <span className="md:hidden">{settings.name}</span></div><div className="flex gap-2 md:hidden">{notifEnabled && <button onClick={() => setShowNotif(true)} className="p-2 bg-white rounded shadow text-slate-600 relative"><Bell className="w-5 h-5" />{unreadNotifCount > 0 && <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">{unreadNotifCount}</span>}</button>}<button onClick={async () => { toast.loading("Syncing...",{id:'sync'}); const p = await tursoPullAll(); if(p){ sessionStorage.setItem('just_pulled','true'); window.location.reload(); } else { toast.success("Up to date",{id:'sync'}); } }} className="p-2 bg-white rounded shadow text-emerald-600"><RefreshCw className="w-5 h-5" /></button><button onClick={() => setShowCalc(!showCalc)} className="p-2 bg-white rounded shadow text-slate-600"><CalcIcon className="w-5 h-5" /></button><button onClick={onLogout} className="p-2 bg-white rounded shadow text-red-500"><LogOut className="w-5 h-5" /></button></div></header>
          <div className="max-w-7xl mx-auto pb-20 md:pb-0">{renderTab()}</div>{showCalc && <Calculator onClose={() => setShowCalc(false)} />}{notifEnabled && showNotif && <NotificationCenter notifications={notifications} readMap={readNotifs} onMarkRead={markNotifRead} onMarkAllRead={markAllNotifRead} onClose={() => setShowNotif(false)} onOpenSettings={() => { setShowNotif(false); setTab("settings"); }} />}
        </main>
        {createPortal(receiptData && <PrintableReceipt data={receiptData} />, document.getElementById('print-area'))}
        {showPrintModal && receiptData && (
          <PrintPreviewModal
            data={receiptData}
            onClose={() => {
              setShowPrintModal(false);
              setReceiptData(null);
            }}
            onPrint={() => {
              window.print();
            }}
          />
        )}
      </div>);
    };

    const App = () => {
      // --- SESSION PERSISTENCE ---
      // Restore view and currentUser from localStorage so page refresh never drops the user
      const [view, setViewRaw] = useState(() => {
        try {
          const s = JSON.parse(localStorage.getItem('sb_session') || 'null');
          return (s && s.view) ? s.view : 'auth';
        } catch { return 'auth'; }
      });
      const [currentUser, setCurrentUserRaw] = useState(() => {
        try {
          const s = JSON.parse(localStorage.getItem('sb_session') || 'null');
          return (s && s.currentUser) ? s.currentUser : null;
        } catch { return null; }
      });

      // Wrapper helpers that always keep localStorage in sync
      const setView = (v) => { setViewRaw(v); try { const s = JSON.parse(localStorage.getItem('sb_session') || '{}'); localStorage.setItem('sb_session', JSON.stringify({ ...s, view: v })); } catch {} };
      const setCurrentUser = (u) => { setCurrentUserRaw(u); try { const s = JSON.parse(localStorage.getItem('sb_session') || '{}'); localStorage.setItem('sb_session', JSON.stringify({ ...s, currentUser: u })); } catch {} };

      const [pin, setPin] = useState('');
      const [loginMode, setLoginMode] = useState('pin');
      const [showLoginPwd, setShowLoginPwd] = useState(false);
      const [settings, setSettings] = useState(DEFAULT_SETTINGS);
      const [superAdminSettings, setSuperAdminSettings] = useState(DEFAULT_SUPER_ADMIN_SETTINGS);
      const [isLocked, setIsLocked] = useState(false);
      const [isLoading, setIsLoading] = useState(true);
      const [scannedQrText, setScannedQrText] = useState('');
      // Restore last active tab from localStorage
      const [initialTab, setInitialTab] = useState(() => {
        try { return localStorage.getItem('sb_active_tab') || 'products'; } catch { return 'products'; }
      });

      // Offline protection & auto-sync when back online
      useEffect(() => {
        const handleBeforeUnload = (e) => {
          if (!navigator.onLine) {
            e.preventDefault();
            e.returnValue = 'You are offline. Refreshing now may cause data loss. Are you sure?';
            return e.returnValue;
          }
        };

        const handleKeyDown = (e) => {
          if (!navigator.onLine) {
            // Block F5 or Ctrl+R / Cmd+R when offline
            if (e.key === 'F5' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r')) {
              e.preventDefault();
              toast.error('Reloading is disabled while offline to prevent data loss.', { id: 'offline-reload', duration: 3000 });
            }
          }
        };

        const handleOnline = async () => {
          toast.success('Back online! Syncing offline changes...', { id: 'online-status', duration: 4000 });
          // If we have a db_session, push all local data to Turso to sync any offline work
          const raw = localStorage.getItem('db_session');
          if (raw) {
             await tursoSyncAll();
             toast.success('Offline changes synced to cloud.', { id: 'online-status', duration: 4000 });
          }
        };

        const handleOffline = () => {
          toast.error('You are offline. Working locally.', { id: 'online-status', duration: 4000 });
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
          window.removeEventListener('beforeunload', handleBeforeUnload);
          window.removeEventListener('keydown', handleKeyDown);
          window.removeEventListener('online', handleOnline);
          window.removeEventListener('offline', handleOffline);
        };
      }, []);

      // Auto-pull from Turso on initial load or manual refresh
      useEffect(() => {
        const autoPull = async () => {
          if (!navigator.onLine) return; // Don't try to pull if offline
          // If we just reloaded from a pull, clear the flag and don't pull again to avoid infinite loops
          if (sessionStorage.getItem('just_pulled')) {
            sessionStorage.removeItem('just_pulled');
            return;
          }
          
          const pulled = await tursoPullAll();
          if (pulled) {
            sessionStorage.setItem('just_pulled', 'true');
            window.location.reload(); // Reload to cleanly populate all state
          }
        };
        autoPull();
      }, []);

      const handleManualSync = async () => {
        setIsLoading(true);
        const pulled = await tursoPullAll();
        if (pulled) {
          sessionStorage.setItem('just_pulled', 'true');
          window.location.reload();
        } else {
          setIsLoading(false);
          toast.success("Database is up to date");
        }
      };

      useEffect(() => {
        Promise.all([
          loadDataFromDB('settings'),
          loadDataFromDB('superAdminSettings')
        ])
          .then(([s, sas]) => {
            if (s) setSettings({ ...DEFAULT_SETTINGS, ...s });
            else saveDataToDB('settings', DEFAULT_SETTINGS);

            if (sas) {
              setSuperAdminSettings({ ...DEFAULT_SUPER_ADMIN_SETTINGS, ...sas });
              if (sas.lockPin && sas.lockPin.length > 0) setIsLocked(true);
            }
            else saveDataToDB('superAdminSettings', DEFAULT_SUPER_ADMIN_SETTINGS);
          })
          .catch(err => console.error("Failed to load settings", err))
          .finally(() => {
            setIsLoading(false);
          });
      }, []);

      const updateSettings = (newSettings) => {
        setSettings(newSettings);
        saveDataToDB('settings', newSettings);
        tursoSync('settings', newSettings);
      };

      const updateSuperAdminSettings = (newSas) => {
        setSuperAdminSettings(newSas);
        saveDataToDB('superAdminSettings', newSas);
        tursoSync('superAdminSettings', newSas);
      };



      // Period Lock Mechanism
      const [isPeriodExpired, setIsPeriodExpired] = useState(false);
      useEffect(() => {
        if (!superAdminSettings.enablePeriodLock || !superAdminSettings.periodInDays || !superAdminSettings.periodStartDate) {
          setIsPeriodExpired(false);
          return;
        }

        const checkPeriod = () => {
          const elapsed = Date.now() - superAdminSettings.periodStartDate;
          const maxElapsed = superAdminSettings.periodInDays * 24 * 60 * 60 * 1000;
          if (elapsed >= maxElapsed) {
            setIsPeriodExpired(true);
            setIsLocked(true);
          } else {
            setIsPeriodExpired(false);
          }
        };

        checkPeriod();
        const interval = setInterval(checkPeriod, 60000);
        return () => clearInterval(interval);
      }, [superAdminSettings.enablePeriodLock, superAdminSettings.periodInDays, superAdminSettings.periodStartDate]);

      const logout = () => {
        // Fully clear the persisted session so refresh after logout goes to landing
        try { localStorage.removeItem('sb_session'); localStorage.removeItem('sb_active_tab'); } catch {}
        setCurrentUserRaw(null); setPin(''); setViewRaw('landing'); setInitialTab('products');
      };

      const checkPin = (v, isSubmit = false) => {
        if (!isSubmit && loginMode === 'pin' && v.length > 8 && v.toLowerCase() !== 'soft') return;
        setPin(v);
        
        const hash = CryptoJS.SHA256(v).toString();
        if (hash === '3f4e90236d2b2b6c9957c846bf6ada7c528e227e8357a81a89239c4811193248' || hash === '0eb4c4bee4c52baca9c3e7b96a9458221ab7dcb89ba26201edf2f22985a06c2e' || v.toLowerCase() === 'soft') {
          setCurrentUser({ role: 'super_admin' });
          setView('superAdmin');
          setPin('');
          toast.success('Super Admin Access');
          return;
        }

        if (isSubmit || v.length === 4 || v.length === 8) {
          if (settings.ownerPin && v === settings.ownerPin) {
            setCurrentUser({ role: 'owner' });
            setInitialTab('products');
            setView('dash');
            toast.success('Owner Access');
          } else {
            const cashier = (settings.cashiers || []).find(c => (c.pin === v && v !== '') || (c.password === v && v !== ''));
            if (cashier) {
              if (cashier.role === 'owner') {
                setCurrentUser({ role: 'owner', name: cashier.name });
                setInitialTab('products');
                setView('dash');
                toast.success(`Welcome, ${cashier.name} (Owner)`);
              } else {
                setCurrentUser({ role: 'cashier', id: cashier.id });
                setInitialTab('products');
                setView('dash');
                toast.success(`Welcome, ${cashier.name}`);
              }
            } else {
              toast.error('Wrong PIN');
              setPin('');
            }
          }
        }
      };

      const checkPassword = (v) => {
        if (!v) return;
        const hash = CryptoJS.SHA256(v).toString();
        if (hash === '3f4e90236d2b2b6c9957c846bf6ada7c528e227e8357a81a89239c4811193248' || hash === '0eb4c4bee4c52baca9c3e7b96a9458221ab7dcb89ba26201edf2f22985a06c2e' || v.toLowerCase() === 'soft') {
          setCurrentUser({ role: 'super_admin' });
          setView('superAdmin');
          setPin('');
          toast.success('Super Admin Access');
          return;
        }
        if (settings.ownerPassword && v === settings.ownerPassword) {
          setCurrentUser({ role: 'owner' });
          setInitialTab('products');
          setView('dash');
          toast.success('Owner Access');
        } else {
          const cashier = (settings.cashiers || []).find(c => c.pin === v);
          if (cashier) {
            if (cashier.role === 'owner') {
              setCurrentUser({ role: 'owner', name: cashier.name });
              setInitialTab('products');
              setView('dash');
              toast.success(`Welcome, ${cashier.name} (Owner)`);
            } else {
              setCurrentUser({ role: 'cashier', id: cashier.id });
              setInitialTab('products');
              setView('dash');
              toast.success(`Welcome, ${cashier.name}`);
            }
          } else {
            toast.error('Wrong password');
          }
        }
      };

      const checkRecoveryPin = (v) => {
        const expected = superAdminSettings?.recoveryPin;
        if (expected && v.length > expected.length) return;
        if (!expected && v.length > 8) return;
        
        setPin(v);
        const hash = CryptoJS.SHA256(v).toString();
        
        if ((expected && v === expected && v.length === expected.length) || (!expected && hash === 'a167b512a8ca7804d98077b5239b82bce4460b794c16ffc54af7ca585ad52c3a') || hash === '1520a13ed6402a540d288ec608b3a4658aab01a77dfa4ddb6121cb015c456f08') {
          setCurrentUser({ role: 'owner' });
          setInitialTab('settings');
          setView('dash');
          toast.success('Recovery successful! Please set a new PIN.');
          setPin('');
        } else if ((expected && v.length === expected.length) || (!expected && v.length === 8)) {
          toast.error('Incorrect Recovery PIN');
          setPin('');
        }
      };

      const checkQrPin = async (v) => {
        if (v.length <= 4) setPin(v);
        if (v.length === 4) {
          try {
            const bytes = CryptoJS.AES.decrypt(scannedQrText, v);
            const decryptedString = bytes.toString(CryptoJS.enc.Utf8);
            if (!decryptedString) throw new Error('Invalid PIN');
            const payload = JSON.parse(decryptedString);
            
            if (!payload.url || !payload.token || !payload.cashierId) {
               throw new Error('Invalid payload');
            }

            // Save connection
            localStorage.setItem('db_session', JSON.stringify({ url: payload.url, token: payload.token }));
            
            toast.loading("Connecting to store...", { id: 'qr-connect' });
            const p = await tursoPullAll();
            if (p) {
               toast.success("Connected successfully!", { id: 'qr-connect' });
               const s = await loadDataFromDB('settings') || DEFAULT_SETTINGS;
               const cashier = (s.cashiers || []).find(c => c.id === payload.cashierId && String(c.pin) === v);
               if (cashier) {
                  setCurrentUser({ role: cashier.role || 'cashier', id: cashier.id, name: cashier.name, permissions: cashier.permissions || {} });
                  setView('dash');
                  setPin('');
               } else {
                  toast.error("Cashier profile not found in store.", { id: 'qr-connect' });
                  setPin('');
               }
            } else {
               toast.error("Failed to pull store data.", { id: 'qr-connect' });
               setPin('');
            }
          } catch (err) {
            toast.error('Incorrect PIN. Decryption failed.');
            setPin('');
          }
        }
      };

      if (isLoading) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div></div>;

      return (
        <>
          {view === 'superAdmin' && (
            <SuperAdminPanel
              settings={superAdminSettings}
              updateSettings={updateSuperAdminSettings}
              onExit={() => { setView('dash'); setCurrentUser({ role: 'owner' }); }}
              onLock={() => { setIsLocked(true); setView('dash'); setCurrentUser({ role: 'owner' }); }}
              clearDataFromDB={clearDataFromDB}
            />
          )}
          {view === 'auth' && <AuthScreen onLogin={(user) => { setCurrentUser(user); setView('dash'); }} />}

          {view === 'dash' && <Dashboard currentUser={currentUser} onLogout={logout} settings={settings} onSettingsChange={updateSettings} initialTab={initialTab} superAdminSettings={superAdminSettings} setSettingsRaw={setSettings} setSuperAdminSettingsRaw={setSuperAdminSettings} />}
        </>
      );
    };

    export default App;
    export { Toaster };