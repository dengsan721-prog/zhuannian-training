export function AdultGatePage() {
  return (
    <main className="app-shell">
      <section className="surface onboarding-stack" aria-labelledby="adult-gate-title">
        <p className="eyebrow">幸福驿站 · 转念训练</p>
        <h1 id="adult-gate-title">仅面向成年人</h1>
        <p>本工具服务成年家长和照护者，不接受未成年人注册。</p>
        <p className="boundary-note">本服务不是急救或危机热线</p>
        <a className="primary-action" href="#/join">我已年满18周岁，继续</a>
      </section>
    </main>
  );
}
