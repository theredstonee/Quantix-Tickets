'use client'

interface LanguageSelectorProps {
  lang: string
  setLang: (lang: string) => void
}

export default function LanguageSelector({ lang, setLang }: LanguageSelectorProps) {
  const changeLanguage = (newLang: string) => {
    setLang(newLang)
    document.cookie = `lang=${newLang}; path=/; max-age=31536000` // 1 year
  }

  return (
    <div className="language-selector" style={{
      position: 'fixed',
      top: '1.5rem',
      left: '1.5rem',
      display: 'flex',
      gap: '0.5rem',
      zIndex: 1000
    }}>
      {['de', 'en', 'he'].map((l) => (
        <button
          key={l}
          onClick={() => changeLanguage(l)}
          className={`lang-btn ${lang === l ? 'active' : ''}`}
          style={{
            background: lang === l ? 'var(--accent-color)' : 'var(--card-bg)',
            border: `2px solid ${lang === l ? 'var(--accent-color)' : 'var(--border-color)'}`,
            borderRadius: '0.5rem',
            padding: '0.5rem 0.8rem',
            fontSize: '1.3rem',
            cursor: 'pointer',
            transition: 'all 0.3s',
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: '3rem',
            boxShadow: lang === l ? '0 2px 8px rgba(0,184,148,0.4)' : '0 2px 4px rgba(0,0,0,0.1)'
          }}
          title={l === 'de' ? 'Deutsch' : l === 'en' ? 'English' : 'עברית'}
        >
          <i className="fas fa-globe" style={{ marginRight: '0.3rem', fontSize: '0.9rem' }}></i>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  )
}
