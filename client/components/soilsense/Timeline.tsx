import { motion, useAnimation } from "framer-motion";
import { useEffect, useRef } from "react";

const steps = [
  { title: "Connect Your Device (ESP32)", desc: "Pair your ESP32 and start streaming soil data securely.", icon: "🔌" },
  { title: "Collect Soil Data", desc: "Moisture, pH, temperature, and nutrients in real-time.", icon: "🧪" },
  { title: "Analyze with AI", desc: "Our models transform raw signals into actionable insights.", icon: "🤖" },
  { title: "Get Actionable Insights", desc: "Recommendations tailored to your crop and soil.", icon: "🌱" },
];

export default function Timeline() {
  const controls = useAnimation();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) controls.start({ opacity: 1, y: 0 });
        });
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [controls]);

  return (
    <section id="how" className="relative py-24">
      <div className="container">
        <h2 className="font-display text-3xl md:text-4xl font-semibold mb-12">How It Works</h2>
        <div ref={ref} className="relative">
          {/* Organic connecting line */}
          <div className="absolute left-4 md:left-1/2 md:-translate-x-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-primary/0 via-primary/50 to-primary/0" />

          <div className="grid md:grid-cols-4 gap-6 relative">
            {steps.map((s, idx) => (
              <motion.div
                key={s.title}
                initial={{ opacity: 0, y: 20 }}
                animate={controls}
                transition={{ delay: idx * 0.05, duration: 0.5 }}
                className="glass rounded-xl p-6 relative overflow-hidden group border border-white/10 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10"
              >
                <div className="absolute inset-0 bg-gradient-to-t from-primary/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="text-3xl mb-3" aria-hidden>{s.icon}</div>
                <h3 className="font-semibold leading-tight">{s.title}</h3>
                <p className="mt-2 text-sm text-foreground/80">{s.desc}</p>
                <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-40 h-40 rounded-full bg-primary/20 blur-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
