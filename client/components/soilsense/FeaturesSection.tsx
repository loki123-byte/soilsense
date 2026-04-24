import { Link } from "react-router-dom";

export function FeaturesSection() {
  const features = [
    { title: 'Reduce Water Usage', desc: 'Targeted irrigation based on real-time moisture levels.' },
    { title: 'Optimize Fertilization', desc: 'AI recommends NPK adjustments per crop and soil.' },
    { title: 'Increase Yield', desc: 'Insights that translate to healthier plants and better harvests.' },
    { title: 'ESP32 Ready', desc: 'Simple device pairing and secure ingestion pipeline.' },
    { title: 'Actionable Dashboards', desc: 'Clear charts and metrics that inform daily decisions.' },
    { title: 'Fast & Private', desc: 'Your data stays secure with on-edge preprocessing.' },
  ];

  return (
    <section id="features" className="py-24">
      <div className="container">
        <h2 className="font-display text-3xl md:text-4xl font-semibold mb-10">Features</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f) => (
            <div key={f.title} className="glass rounded-xl p-6 border border-white/10 hover:border-primary/40 transition-colors">
              <h3 className="font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-foreground/80">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function CTASection() {
  return (
    <section id="cta" className="py-24">
      <div className="container">
        <div className="glass rounded-2xl p-10 border border-white/10 text-center relative overflow-hidden">
          <div className="absolute -inset-20 bg-[radial-gradient(circle_at_center,_hsl(152_44%_32%/_0.2),_transparent_60%)] animate-fog" />
          <h2 className="relative font-display text-3xl md:text-4xl font-semibold">Get Started with SoilSense</h2>
          <p className="relative mt-3 text-foreground/80 max-w-2xl mx-auto">Connect your devices, upload soil data, and let our AI guide your next steps for smarter, sustainable farming.</p>
          <Link to="/get-started" className="relative inline-block mt-6">
            <span className="px-6 py-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20">Start Now</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
