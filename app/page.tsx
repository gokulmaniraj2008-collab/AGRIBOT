import { MarketingNavbar } from "@/components/marketing/MarketingNavbar";
import { Hero } from "@/components/marketing/Hero";
import { ProblemSection } from "@/components/marketing/ProblemSection";
import { SolutionSection } from "@/components/marketing/SolutionSection";
import { Footer } from "@/components/marketing/Footer";

export default function LandingPage() {
  return (
    <>
      <MarketingNavbar />
      <Hero />
      <ProblemSection />
      <SolutionSection />
      <Footer />
    </>
  );
}
