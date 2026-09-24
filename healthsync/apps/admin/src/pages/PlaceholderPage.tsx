import styles from './Page.module.css';

interface PlaceholderProps {
  title: string;
  description: string;
  icon?: string;
}

export default function PlaceholderPage({ title, description, icon = '🚧' }: PlaceholderProps) {
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{title}</h1>
      <div className={styles.card}>
        <div className={styles.emptyState}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>{icon}</div>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>{title}</div>
          <div style={{ maxWidth: 420, color: '#9E9E9E', lineHeight: 1.7 }}>{description}</div>
        </div>
      </div>
    </div>
  );
}
