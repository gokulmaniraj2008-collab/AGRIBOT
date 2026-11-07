export default function Home() {
  return (
    <main className="page-shell">
      <div className="glow glow-one" aria-hidden="true" />
      <div className="glow glow-two" aria-hidden="true" />
      <section className="coming-card" aria-labelledby="brand-title">
        <div className="brand-mark" aria-hidden="true">🌱</div>
        <p className="eyebrow">SMART AGRICULTURE • A NEW BEGINNING</p>
        <h1 id="brand-title">AGRIBOT</h1>
        <div className="status-line"><span /> SOMETHING IS GROWING</div>
        <h2>COMING SOON</h2>
        <p className="description">The future of smart agriculture is taking root.</p>
        <p className="supporting">We’re cultivating something better. Our new experience will be here soon.</p>
        <div className="bottom-rule"><span /> GROWING THE FUTURE <span /></div>
      </section>
      <footer>© {new Date().getFullYear()} AGRIBOT. All rights reserved.</footer>
    </main>
  );
}
