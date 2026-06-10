import {
  ShieldCheck, HeartPulse, Infinity as InfinityIcon, Users, LifeBuoy, HandHeart, Brain,
  FileCheck2, GraduationCap, BookOpen, Megaphone, Sprout, TrendingDown, Search, PencilRuler,
  Presentation, Repeat, Heart, Sparkles, Building2, UserCog, FileText, ListChecks, CalendarHeart,
  Compass, Quote, Mic, Clock, Download, ExternalLink, Lock, ArrowRight, Check, Play, Clapperboard,
  ScrollText, ShieldAlert, Users2, ClipboardList, Route, MessageCircle, Mail, MapPin, Star,
  type LucideIcon,
} from 'lucide-react';

/** Mapa nome→componente para ícones vindos do CMS (data.icon é string). */
export const iconByName: Record<string, LucideIcon> = {
  ShieldCheck, HeartPulse, Infinity: InfinityIcon, Users, LifeBuoy, HandHeart, Brain,
  FileCheck2, GraduationCap, BookOpen, Megaphone, Sprout, TrendingDown, Search, PencilRuler,
  Presentation, Repeat, Heart, Sparkles, Building2, UserCog, FileText, ListChecks, CalendarHeart,
  Compass, Quote, Mic, Clock, Download, ExternalLink, Lock, ArrowRight, Check, Play, Clapperboard,
  ScrollText, ShieldAlert, Users2, ClipboardList, Route, MessageCircle, Mail, MapPin, Star,
};

/** Resolve um ícone: string (nome do CMS) ou componente (default) → componente. */
export function resolveIcon(v: unknown): LucideIcon {
  if (typeof v === 'function') return v as LucideIcon;
  if (typeof v === 'string' && iconByName[v]) return iconByName[v];
  return Sparkles;
}
