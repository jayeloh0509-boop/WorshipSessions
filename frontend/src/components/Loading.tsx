import { useI18n } from '../context/I18nContext';

export function Loading() {
  const { t } = useI18n();
  return (
    <div className="loading-screen" role="status" aria-live="polite">
      <div className="loading-mark" aria-hidden="true">
        ♪
      </div>
      <div className="loading-brand">WorshipSessions</div>
      <div className="loading-pulse" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <p>{t('common.loading')}</p>
    </div>
  );
}
