'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './setup.module.css';
import { LayoutDashboard, User, Mail, Lock, ArrowRight, Loader2, CheckCircle } from 'lucide-react';

export default function SetupPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Setup failed. Please try again.');
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        router.push('/login');
      }, 2000);
    } catch {
      setError('An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.bgDecor}>
        <div className={styles.bgOrb1} />
        <div className={styles.bgOrb2} />
      </div>

      <div className={styles.card}>
        <div className={styles.logoSection}>
          <div className={styles.logoIcon}>
            <LayoutDashboard size={28} />
          </div>
          <h1 className={styles.logoText}>Welcome to TaskBoard</h1>
          <p className={styles.subtitle}>Create your administrator account to get started</p>
        </div>

        {success ? (
          <div className={styles.successBox}>
            <CheckCircle size={48} />
            <h2>Setup Complete!</h2>
            <p>Redirecting to login...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className={styles.form}>
            {error && <div className={styles.errorBox}>{error}</div>}

            <div className={styles.inputGroup}>
              <label htmlFor="name">Full Name</label>
              <div className={styles.inputWrapper}>
                <User size={18} className={styles.inputIcon} />
                <input
                  id="name" type="text" value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your full name" required minLength={2}
                  className={styles.input}
                />
              </div>
            </div>

            <div className={styles.inputGroup}>
              <label htmlFor="setup-email">Email</label>
              <div className={styles.inputWrapper}>
                <Mail size={18} className={styles.inputIcon} />
                <input
                  id="setup-email" type="email" value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@company.com" required
                  className={styles.input}
                />
              </div>
            </div>

            <div className={styles.inputGroup}>
              <label htmlFor="setup-password">Password</label>
              <div className={styles.inputWrapper}>
                <Lock size={18} className={styles.inputIcon} />
                <input
                  id="setup-password" type="password" value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 6 characters" required minLength={6}
                  className={styles.input}
                />
              </div>
            </div>

            <div className={styles.inputGroup}>
              <label htmlFor="confirm-password">Confirm Password</label>
              <div className={styles.inputWrapper}>
                <Lock size={18} className={styles.inputIcon} />
                <input
                  id="confirm-password" type="password" value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat your password" required minLength={6}
                  className={styles.input}
                />
              </div>
            </div>

            <button type="submit" disabled={loading} className={styles.submitBtn}>
              {loading ? <Loader2 size={20} className={styles.spinIcon} /> : <ArrowRight size={20} />}
              <span>{loading ? 'Creating account...' : 'Create Admin Account'}</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
