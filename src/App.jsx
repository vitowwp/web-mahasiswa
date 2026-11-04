import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Html5QrcodeScanner } from 'html5-qrcode';

const SUPABASE_URL = 'https://pkbrkgyudkmqfqovsuut.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_VawMamIxqOEWkvKkZsQvpA_tB0NPrKg';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default function App() {
  const [session, setSession] = useState(null);
  const [loadingSession, setLoadingSession] = useState(true);

  const queryParams = new URLSearchParams(window.location.search);
  const urlClassId = queryParams.get('class_id') || '';

  const [currentClass, setCurrentClass] = useState(null);
  const [classId, setClassId] = useState(urlClassId);
  const [selectedPace, setSelectedPace] = useState(null);
  const [submittedPace, setSubmittedPace] = useState(false);
  
  // State untuk Cooldown 5 Menit
  const [cooldownTime, setCooldownTime] = useState(0);

  const [questionText, setQuestionText] = useState('');
  const [submittedQuestion, setSubmittedQuestion] = useState(false);

  const [isScanning, setIsScanning] = useState(false);

  // 1. Cek Sesi Login Google / Supabase Mahasiswa
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoadingSession(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoadingSession(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Ambil detail kelas yang sedang aktif berdasarkan classId (hasil scan / URL)
  useEffect(() => {
    if (!session || !classId) return;

    const fetchClassDetails = async () => {
      const { data, error } = await supabase
        .from('classes')
        .select('*')
        .eq('id', classId)
        .single();

      if (!error && data) {
        setCurrentClass(data);
      } else {
        setCurrentClass(null);
      }
    };

    fetchClassDetails();
  }, [session, classId]);

  // Cek Cooldown dari localStorage saat classId berubah
  useEffect(() => {
    if (!classId) return;
    const lastVoteTime = localStorage.getItem(`last_vote_${classId}`);
    if (lastVoteTime) {
      const elapsed = Math.floor((Date.now() - parseInt(lastVoteTime)) / 1000);
      const cooldownDuration = 5 * 60; // 5 menit
      if (elapsed < cooldownDuration) {
        setCooldownTime(cooldownDuration - elapsed);
      } else {
        setCooldownTime(0);
      }
    }
  }, [classId]);

  // Interval Timer Cooldown Hitung Mundur
  useEffect(() => {
    if (cooldownTime > 0) {
      const timer = setInterval(() => {
        setCooldownTime((prev) => (prev > 1 ? prev - 1 : 0));
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [cooldownTime]);

const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });
    if (error) {
      alert('Gagal login: ' + error.message);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  // Logika Scanner Kamera QR
  useEffect(() => {
    let scanner = null;
    if (isScanning) {
      scanner = new Html5QrcodeScanner(
        "reader", 
        { fps: 10, qrbox: { width: 250, height: 250 } }, 
        false
      );

      scanner.render(
        (decodedText) => {
          try {
            const urlObj = new URL(decodedText);
            const scannedClassId = urlObj.searchParams.get('class_id');
            
            if (scannedClassId) {
              handleScannedClass(scannedClassId);
              scanner.clear();
              setIsScanning(false);
            } else {
              alert('QR Code valid, tapi tidak memiliki data kelas.');
            }
          } catch {
            alert('Format QR Code tidak dikenali.');
          }
        },
        () => {}
      );
    }

    return () => {
      if (scanner) {
        scanner.clear().catch(() => {});
      }
    };
  }, [isScanning]);

  const handleScannedClass = (scannedId) => {
    setClassId(scannedId);
    setSelectedPace(null);
    setSubmittedPace(false);
    window.history.pushState({}, '', `/?class_id=${scannedId}`);
    alert(`Berhasil bergabung ke kelas: ${scannedId}!`);
  };

  // Fungsi Kirim Polling dengan Batasan 5 Menit
  const handleVote = async (option) => {
    if (cooldownTime > 0) {
      const minutes = Math.floor(cooldownTime / 60);
      const seconds = cooldownTime % 60;
      alert(`Harap tunggu ${minutes} menit ${seconds} detik lagi sebelum mengirim polling baru.`);
      return;
    }

    setSelectedPace(option);
    const { error } = await supabase
      .from('polling_responses')
      .insert([{ class_id: classId, pace_option: option }]);

    if (!error) {
      setSubmittedPace(true);
      const now = Date.now();
      localStorage.setItem(`last_vote_${classId}`, now.toString());
      setCooldownTime(5 * 60);
    } else {
      alert('Gagal mengirim polling. Coba lagi.');
    }
  };

  const handleSendQuestion = async (e) => {
    e.preventDefault();
    if (!questionText.trim()) return;

    const { error } = await supabase
      .from('anonymous_questions')
      .insert([{ class_id: classId, question_text: questionText }]);

    if (!error) {
      setSubmittedQuestion(true);
      setQuestionText('');
      setTimeout(() => setSubmittedQuestion(false), 3000);
    } else {
      alert('Gagal mengirim pertanyaan.');
    }
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  if (loadingSession) {
    return <div style={{ textAlign: 'center', marginTop: '100px', fontFamily: 'sans-serif' }}>Memuat akun...</div>;
  }

  // TAMPILAN JIKA BELUM LOGIN
  if (!session) {
    return (
      <div style={{ maxWidth: '400px', margin: '80px auto', padding: '30px', textAlign: 'center', border: '1px solid #ddd', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', backgroundColor: '#fff', fontFamily: 'sans-serif' }}>
        <h2>Portal Polling Kuliah</h2>
        <p style={{ color: '#666', marginBottom: '30px', fontSize: '14px' }}>
          Silakan masuk menggunakan akun Google / SSO institusi Anda untuk melanjutkan.
        </p>
        <button
          onClick={handleGoogleLogin}
          style={{
            backgroundColor: '#4285F4',
            color: 'white',
            padding: '12px 20px',
            border: 'none',
            borderRadius: '6px',
            fontSize: '15px',
            fontWeight: 'bold',
            cursor: 'pointer',
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px'
          }}
        >
          🔑 Login dengan Google / SSO
        </button>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', fontSize: '12px', background: '#f1f5f9', padding: '8px 12px', borderRadius: '6px' }}>
          <span>Masuk: <strong>{session.user.email}</strong></span>
          <button onClick={handleLogout} style={styles.logoutBtn}>Logout</button>
        </div>

        <span style={styles.badge}>Mode Mahasiswa</span>
        <h2>Polling & Q&A Anonim Kuliah</h2>
        
        {/* Kotak Informasi Kelas Aktif & Tombol Scan */}
        <div style={styles.classSelectorBox}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontSize: '12px', color: '#64748b' }}>Kelas Terhubung:</span>
              <h4 style={{ margin: '2px 0 0 0', color: '#1e293b' }}>
                {currentClass ? `${currentClass.name} (${currentClass.id})` : 'Belum memilih kelas / Silakan Scan QR'}
              </h4>
            </div>
            <button 
              onClick={() => setIsScanning(!isScanning)} 
              style={styles.scanToggleBtn}
            >
              {isScanning ? '❌ Tutup Kamera' : '📷 Scan Barcode Dosen'}
            </button>
          </div>
        </div>

        {isScanning && (
          <div style={styles.scannerCard}>
            <p style={{ fontSize: '13px', fontWeight: 'bold', color: '#1e293b', marginBottom: '8px' }}>
              Arahkan kamera ke QR Code di Laptop Dosen:
            </p>
            <div id="reader" style={{ width: '100%' }}></div>
          </div>
        )}
      </header>

      {/* Jika belum scan kelas / kelas tidak ditemukan */}
      {!currentClass ? (
        <div style={{ ...styles.card, textAlign: 'center', padding: '40px 20px' }}>
          <h3>⚠️ Anda Belum Masuk ke Kelas Manapun</h3>
          <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '20px' }}>
            Silakan klik tombol <b>"Scan Barcode Dosen"</b> di atas atau buka link dari dosen untuk mulai mengikuti polling.
          </p>
        </div>
      ) : (
        <>
          {/* Bagian Polling */}
          <div style={styles.card}>
            <h3>Bagaimana ritme belajar materi saat ini?</h3>
            
            {submittedPace && (
              <div style={styles.successBox}>
                <p style={{ margin: 0, fontWeight: 'bold', color: '#166534' }}>✓ Pilihan "<b>{selectedPace}</b>" berhasil dikirim!</p>
              </div>
            )}

            {/* Info Cooldown Timer jika sedang aktif */}
            {cooldownTime > 0 && (
              <div style={styles.cooldownBox}>
                <p style={{ margin: 0, fontSize: '13px', color: '#b45309', fontWeight: 'bold' }}>
                  ⏳ Anda dapat mengirim polling lagi dalam: <span style={{ fontSize: '15px' }}>{formatTime(cooldownTime)}</span>
                </p>
              </div>
            )}

            <div style={styles.buttonGrid}>
              {[
                { label: 'Terlalu Cepat', emoji: '🚀', color: '#f59e0b' },
                { label: 'Pas & Jelas', emoji: '👍', color: '#10b981' },
                { label: 'Terlalu Lambat', emoji: '🐢', color: '#3b82f6' },
                { label: 'Ulangi Lagi', emoji: '🔄', color: '#ef4444' },
              ].map((item) => (
                <button
                  key={item.label}
                  onClick={() => handleVote(item.label)}
                  style={{
                    ...styles.voteBtn,
                    borderColor: selectedPace === item.label ? item.color : '#cbd5e1',
                    backgroundColor: selectedPace === item.label ? '#f8fafc' : '#fff',
                    opacity: cooldownTime > 0 ? 0.6 : 1,
                    cursor: cooldownTime > 0 ? 'not-allowed' : 'pointer'
                  }}
                >
                  <span style={{ fontSize: '24px' }}>{item.emoji}</span>
                  <span style={{ fontWeight: 'bold', color: '#334155' }}>{item.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Bagian Pertanyaan Anonim */}
          <div style={styles.card}>
            <h3>Tanyakan Sesuatu (Anonim)</h3>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '12px' }}>
              Identitas Anda dirahasiakan dan masuk ke dashboard kelas <b>{currentClass.name}</b>.
            </p>

            <form onSubmit={handleSendQuestion}>
              <textarea
                rows="3"
                placeholder="Tulis pertanyaanmu di sini..."
                value={questionText}
                onChange={(e) => setQuestionText(e.target.value)}
                style={styles.textarea}
                required
              ></textarea>
              <button type="submit" style={styles.submitBtn}>Kirim ke Dosen</button>
            </form>

            {submittedQuestion && (
              <p style={{ color: '#166534', backgroundColor: '#dcfce7', padding: '10px', borderRadius: '8px', marginTop: '10px', fontSize: '14px' }}>
                ✓ Pertanyaan anonim berhasil dikirim!
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

const styles = {
  container: { padding: '20px', fontFamily: 'sans-serif', backgroundColor: '#f8fafc', minHeight: '100vh', maxWidth: '600px', margin: '0 auto' },
  header: { backgroundColor: '#fff', padding: '20px', borderRadius: '12px', marginBottom: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', textAlign: 'center' },
  badge: { backgroundColor: '#e0e7ff', color: '#3730a3', padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold' },
  classSelectorBox: { marginTop: '12px', textAlign: 'left', backgroundColor: '#f1f5f9', padding: '12px', borderRadius: '8px' },
  scanToggleBtn: { backgroundColor: '#2563eb', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' },
  scannerCard: { marginTop: '14px', padding: '12px', backgroundColor: '#fff', border: '2px dashed #2563eb', borderRadius: '8px' },
  card: { backgroundColor: '#fff', padding: '20px', borderRadius: '12px', marginBottom: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' },
  successBox: { backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', padding: '12px', borderRadius: '8px', marginBottom: '16px' },
  cooldownBox: { backgroundColor: '#fef3c7', border: '1px solid #fde68a', padding: '10px 12px', borderRadius: '8px', marginBottom: '16px', textAlign: 'center' },
  buttonGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' },
  voteBtn: { padding: '16px', borderRadius: '10px', border: '2px solid', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', transition: 'all 0.2s' },
  textarea: { width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box', marginBottom: '10px' },
  submitBtn: { width: '100%', padding: '12px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' },
  logoutBtn: { backgroundColor: '#ef4444', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }
};
