'use client'

import { useSession, signIn, signOut } from 'next-auth/react'
import { useState, useEffect } from 'react'
import ThemeToggle from '@/components/ThemeToggle'
import LanguageSelector from '@/components/LanguageSelector'

export default function Home() {
  const { data: session } = useSession()
  const [lang, setLang] = useState('de')

  useEffect(() => {
    // Load language from cookie
    const cookieLang = document.cookie
      .split('; ')
      .find(row => row.startsWith('lang='))
      ?.split('=')[1]
    if (cookieLang) setLang(cookieLang)
  }, [])

  const t = {
    de: {
      title: 'Professionelles Ticket-System für Discord',
      loginWith: 'Mit Discord anmelden',
      loggedInAs: 'Angemeldet als',
      adminPanel: 'Zum Admin Panel',
      logout: 'Abmelden',
      features: {
        multiLang: {
          title: 'Multi-Sprache',
          desc: 'Unterstützt Deutsch, Englisch und Hebräisch mit vollständiger Übersetzung für Bot und Web-Panel.'
        },
        webManagement: {
          title: 'Web-Verwaltung',
          desc: 'Umfassendes Admin-Panel zur Konfiguration von Topics, Formularen und Embeds.'
        },
        gdpr: {
          title: 'DSGVO-konform',
          desc: 'Vollständige Datenschutzerklärung und Nutzungsbedingungen mit Datenlöschung nach 2 Monaten.'
        },
        ticketMgmt: {
          title: 'Ticket-Verwaltung',
          desc: 'Prioritäten, Claiming, Transkripte und vollständige Ticket-Historie im Web-Panel.'
        },
        dynamicForms: {
          title: 'Dynamische Formulare',
          desc: 'Erstelle benutzerdefinierte Formularfelder für jeden Ticket-Typ über das Web-Panel.'
        },
        darkMode: {
          title: 'Dark Mode',
          desc: 'Modernes Design mit automatischem Dark Mode und RTL-Unterstützung für Hebräisch.'
        }
      },
      legal: {
        imprint: 'Impressum',
        terms: 'Nutzungsbedingungen',
        privacy: 'Datenschutzerklärung'
      },
      footer: 'Betrieben von'
    },
    en: {
      title: 'Professional Ticket System for Discord',
      loginWith: 'Login with Discord',
      loggedInAs: 'Logged in as',
      adminPanel: 'Go to Admin Panel',
      logout: 'Logout',
      features: {
        multiLang: {
          title: 'Multi-Language',
          desc: 'Supports German, English and Hebrew with complete translation for bot and web panel.'
        },
        webManagement: {
          title: 'Web Management',
          desc: 'Comprehensive admin panel for configuring topics, forms and embeds.'
        },
        gdpr: {
          title: 'GDPR Compliant',
          desc: 'Complete privacy policy and terms of service with data deletion after 2 months.'
        },
        ticketMgmt: {
          title: 'Ticket Management',
          desc: 'Priorities, claiming, transcripts and complete ticket history in the web panel.'
        },
        dynamicForms: {
          title: 'Dynamic Forms',
          desc: 'Create custom form fields for each ticket type via the web panel.'
        },
        darkMode: {
          title: 'Dark Mode',
          desc: 'Modern design with automatic dark mode and RTL support for Hebrew.'
        }
      },
      legal: {
        imprint: 'Legal Notice',
        terms: 'Terms of Service',
        privacy: 'Privacy Policy'
      },
      footer: 'Operated by'
    }
  }

  const translations = t[lang as keyof typeof t] || t.de

  return (
    <div className="page-container">
      <ThemeToggle />
      <LanguageSelector lang={lang} setLang={setLang} />

      <div className="hero">
        <h1><i className="fas fa-ticket-alt"></i> TRS Tickets</h1>
        <p>{translations.title}</p>
        <div className="version-badge" style={{
          display: 'inline-block',
          background: 'rgba(255,255,255,0.2)',
          padding: '0.3rem 1rem',
          borderRadius: '2rem',
          fontSize: '0.9rem',
          marginTop: '0.5rem'
        }}>
          Beta 0.2.0
        </div>

        {session ? (
          <>
            <div style={{
              background: 'rgba(255,255,255,0.15)',
              padding: '0.8rem 1.5rem',
              borderRadius: '2rem',
              marginBottom: '1.5rem',
              marginTop: '1.5rem',
              display: 'inline-block',
              fontSize: '0.95rem'
            }}>
              {translations.loggedInAs} <strong>{session.user?.name}</strong>
            </div>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap', marginTop: '2rem' }}>
              <a href="/select-server" className="btn-primary">
                <i className="fas fa-cog"></i> {translations.adminPanel}
              </a>
              <button onClick={() => signOut()} className="btn-secondary">
                <i className="fas fa-sign-out-alt"></i> {translations.logout}
              </button>
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '2rem' }}>
            <button onClick={() => signIn('discord')} className="btn-primary">
              <i className="fab fa-discord"></i> {translations.loginWith}
            </button>
          </div>
        )}
      </div>

      <div className="content-wrapper" style={{ padding: '0 0 4rem 0' }}>
        <div className="features">
          <div className="feature-card">
            <h3><i className="fas fa-language"></i> {translations.features.multiLang.title}</h3>
            <p>{translations.features.multiLang.desc}</p>
          </div>

          <div className="feature-card">
            <h3><i className="fas fa-tools"></i> {translations.features.webManagement.title}</h3>
            <p>{translations.features.webManagement.desc}</p>
          </div>

          <div className="feature-card">
            <h3><i className="fas fa-shield-alt"></i> {translations.features.gdpr.title}</h3>
            <p>{translations.features.gdpr.desc}</p>
          </div>

          <div className="feature-card">
            <h3><i className="fas fa-tasks"></i> {translations.features.ticketMgmt.title}</h3>
            <p>{translations.features.ticketMgmt.desc}</p>
          </div>

          <div className="feature-card">
            <h3><i className="fas fa-clipboard-list"></i> {translations.features.dynamicForms.title}</h3>
            <p>{translations.features.dynamicForms.desc}</p>
          </div>

          <div className="feature-card">
            <h3><i className="fas fa-moon"></i> {translations.features.darkMode.title}</h3>
            <p>{translations.features.darkMode.desc}</p>
          </div>
        </div>

        <div style={{
          textAlign: 'center',
          marginTop: '4rem',
          paddingTop: '3rem',
          borderTop: '1px solid var(--border-color)'
        }}>
          <a href="/imprint" style={{ margin: '0 1rem' }}>
            <i className="fas fa-file-alt"></i> {translations.legal.imprint}
          </a>
          <a href="/terms-of-service" style={{ margin: '0 1rem' }}>
            <i className="fas fa-file-contract"></i> {translations.legal.terms}
          </a>
          <a href="/privacy-policy" style={{ margin: '0 1rem' }}>
            <i className="fas fa-lock"></i> {translations.legal.privacy}
          </a>
        </div>
      </div>

      <footer style={{
        marginTop: '5rem',
        paddingTop: '3rem',
        borderTop: '1px solid var(--border-color)',
        textAlign: 'center',
        fontSize: '0.85rem',
        opacity: 0.7
      }}>
        <p>TRS Tickets ©️ {new Date().getFullYear()} | {translations.footer} Ohev Tamerin | <a href="/imprint">{translations.legal.imprint}</a></p>
      </footer>
    </div>
  )
}
