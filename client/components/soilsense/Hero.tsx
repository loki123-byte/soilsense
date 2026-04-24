import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

interface HeroProps {
  onCheckSoil: () => void;
  onOpenChat: () => void;
}

export default function Hero({ onCheckSoil, onOpenChat }: HeroProps) {
  return (
    <section className="relative min-h-[88vh] w-full fog-bottom">
      <video
        className="absolute inset-0 w-full h-full object-cover"
        autoPlay
        muted
        loop
        playsInline
        poster="/placeholder.svg"
        src="https://videos.pexels.com/video-files/5732835/5732835-sd_960_540_25fps.mp4"
      />
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[1px]" />

      <div className="relative container flex flex-col items-center justify-center text-center min-h-[88vh]">
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="font-hero text-4xl md:text-6xl font-semibold tracking-tight max-w-4xl"
        >
          AI-Powered Insights for Smarter Farming
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1 }}
          className="mt-4 italic text-foreground/80 max-w-2xl"
        >
          Optimizing your fields with real-time soil data.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="mt-8 flex flex-wrap items-center justify-center gap-4"
        >
          <Button
            onClick={onCheckSoil}
            className="bg-primary hover:bg-primary/90 text-primary-foreground px-6 py-6 text-base rounded-lg pulse-glow"
          >
            Check Your Soil
          </Button>
          <Button
            onClick={onOpenChat}
            variant="secondary"
            className="bg-secondary hover:bg-secondary/80 text-secondary-foreground px-6 py-6 text-base rounded-lg"
          >
            Chat with AI
          </Button>
        </motion.div>
      </div>
    </section>
  );
}
