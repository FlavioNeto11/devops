import Hero from '../components/Hero';
import NR1Section from '../components/NR1Section';
import AboutSection from '../components/AboutSection';
import PalestrasSection from '../components/PalestrasSection';
import ConsultoriaSection from '../components/ConsultoriaSection';
import PublicoSection from '../components/PublicoSection';
import CTASection from '../components/CTASection';

export default function Home() {
  return (
    <>
      <Hero />
      <NR1Section />
      <AboutSection />
      <PalestrasSection />
      <ConsultoriaSection />
      <PublicoSection />
      <CTASection />
    </>
  );
}
