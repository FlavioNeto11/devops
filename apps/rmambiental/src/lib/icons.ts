import {
  ShieldCheck, Building2, FlaskConical, Recycle, Factory, Home, HardHat, Mountain, Wheat, Zap,
  Droplets, Building, TrainFront, Landmark, BadgeCheck, Gauge, Workflow, Search, FileSearch, Map,
  FileCheck2, Check, Leaf, ShieldAlert, ScrollText, Sprout, Scale, ArrowRight, MessageCircle, Mail,
  Compass, Users, MapPin, Sparkles,
  type LucideIcon,
} from 'lucide-react';

export const iconByName: Record<string, LucideIcon> = {
  ShieldCheck, Building2, FlaskConical, Recycle, Factory, Home, HardHat, Mountain, Wheat, Zap,
  Droplets, Building, TrainFront, Landmark, BadgeCheck, Gauge, Workflow, Search, FileSearch, Map,
  FileCheck2, Check, Leaf, ShieldAlert, ScrollText, Sprout, Scale, ArrowRight, MessageCircle, Mail,
  Compass, Users, MapPin, Sparkles,
};

export function resolveIcon(v: unknown): LucideIcon {
  if (typeof v === 'function') return v as LucideIcon;
  if (typeof v === 'string' && iconByName[v]) return iconByName[v];
  return Sparkles;
}
