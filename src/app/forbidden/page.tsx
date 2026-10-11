import styles from "./forbidden.module.css";

export default function ForbiddenPage() {
  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <h1>Access denied</h1>
        <p>
          Your account does not have permission to open this ASB LiftDoc module.
        </p>
      </section>
    </main>
  );
}