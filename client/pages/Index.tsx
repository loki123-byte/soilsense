import Layout from "@/components/soilsense/Layout";
import Hero from "@/components/soilsense/Hero";
import Timeline from "@/components/soilsense/Timeline";
import type { ParsedSoilData } from "@/components/soilsense/UploadSection";
import { useNavigate } from "react-router-dom";
import InsightsSection from "@/components/soilsense/InsightsSection";
import Testimonials from "@/components/soilsense/Testimonials";
import {
  FeaturesSection,
  CTASection,
} from "@/components/soilsense/FeaturesSection";
import ChatModal from "@/components/soilsense/ChatModal";
import { useState } from "react";

export default function Index() {
  const [chatOpen, setChatOpen] = useState(false);
  const [data, setData] = useState<ParsedSoilData | null>(null);

  const navigate = useNavigate();
  return (
    <Layout>
      <Hero
        onCheckSoil={() => navigate("/get-started")}
        onOpenChat={() => setChatOpen(true)}
      />
      <Timeline />
      <InsightsSection data={data} />
      <Testimonials />
      <FeaturesSection />
      <CTASection />
      <ChatModal open={chatOpen} onOpenChange={setChatOpen} />
    </Layout>
  );
}
