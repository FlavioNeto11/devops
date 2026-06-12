// Allowlist de ícones (nomes lucide vindos do CMS/IA → componente). Imports
// EXPLÍCITOS para o tree-shaking manter o bundle pequeno; nome desconhecido cai
// no Sparkles. Espelha o padrão dos portais (apps/*/src/lib/icons.ts), enxuto.
import {
  Sparkles, ShieldCheck, Shield, Users, User, Heart, HeartPulse, Brain, Leaf, TreePine,
  Target, Star, Check, CheckCircle2, Activity, Dumbbell, Calendar, CalendarDays, Clock,
  MapPin, Map, Phone, Mail, MessageCircle, Award, Trophy, Medal, Zap, Flame, TrendingUp,
  BarChart3, LineChart, BookOpen, GraduationCap, Briefcase, Building2, Globe, Settings,
  Wrench, Search, Lightbulb, Rocket, Smile, ThumbsUp, FileText, Download, Play, Music,
  Camera, Sun, Moon, Droplets, Wind, Mountain, Home, Car, Lock, Key, DollarSign, Wallet,
  Gift, ShoppingCart, Coffee, Utensils, Apple, Baby, Bike, Footprints, Timer, Gauge,
  Handshake, HandHeart, Mic, Quote, Recycle, Factory, HardHat, Stethoscope, Pill,
} from 'lucide-react';

const byName = {
  Sparkles, ShieldCheck, Shield, Users, User, Heart, HeartPulse, Brain, Leaf, TreePine,
  Target, Star, Check, CheckCircle2, Activity, Dumbbell, Calendar, CalendarDays, Clock,
  MapPin, Map, Phone, Mail, MessageCircle, Award, Trophy, Medal, Zap, Flame, TrendingUp,
  BarChart3, LineChart, BookOpen, GraduationCap, Briefcase, Building2, Globe, Settings,
  Wrench, Search, Lightbulb, Rocket, Smile, ThumbsUp, FileText, Download, Play, Music,
  Camera, Sun, Moon, Droplets, Wind, Mountain, Home, Car, Lock, Key, DollarSign, Wallet,
  Gift, ShoppingCart, Coffee, Utensils, Apple, Baby, Bike, Footprints, Timer, Gauge,
  Handshake, HandHeart, Mic, Quote, Recycle, Factory, HardHat, Stethoscope, Pill,
};

export function resolveIcon(name) {
  return (typeof name === 'string' && byName[name]) || Sparkles;
}
