import Hero from '../components/Hero';
import Positioning from '../components/Positioning';
import ServicesSection from '../components/ServicesSection';
import ProcessSection from '../components/ProcessSection';
import AuthoritySection from '../components/AuthoritySection';
import SectorsSection from '../components/SectorsSection';
import ProjectsGallery from '../components/ProjectsGallery';
import ESGSection from '../components/ESGSection';
import CTASection from '../components/CTASection';

export default function Home() {
  return (
    <>
      <Hero />
      <Positioning />
      <ServicesSection />
      <ProcessSection />
      <AuthoritySection />
      <SectorsSection />
      <ProjectsGallery />
      <ESGSection />
      <CTASection />
    </>
  );
}
