import Hero from '../components/Hero';
import NR1Section from '../components/NR1Section';
import AboutSection from '../components/AboutSection';
import ComoTrabalhoSection from '../components/ComoTrabalhoSection';
import ValoresSection from '../components/ValoresSection';
import PalestrasSection from '../components/PalestrasSection';
import MidiaSection from '../components/MidiaSection';
import MateriaisSection from '../components/MateriaisSection';
import ConsultoriaSection from '../components/ConsultoriaSection';
import PublicoSection from '../components/PublicoSection';
import FaqSection from '../components/FaqSection';
import DepoimentosSection from '../components/DepoimentosSection';
import LeadForm from '../components/LeadForm';
import CTASection from '../components/CTASection';

export default function Home() {
  return (
    <>
      <Hero />
      <NR1Section />
      <AboutSection />
      <ComoTrabalhoSection />
      <ValoresSection />
      <PalestrasSection />
      <MidiaSection />
      <MateriaisSection />
      <ConsultoriaSection />
      <PublicoSection />
      <FaqSection />
      <DepoimentosSection />
      <LeadForm variant="section" />
      <CTASection />
    </>
  );
}
