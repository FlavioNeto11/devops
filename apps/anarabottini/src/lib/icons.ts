import {
  ShieldCheck, ShieldAlert, Shield, HeartPulse, Heart, Infinity as InfinityIcon, Users, Users2, User,
  UserCog, UserCheck, UserPlus, LifeBuoy, HandHeart, Handshake, Brain, FileCheck2, FileCheck, FileText,
  FileSearch, Files, File, GraduationCap, BookOpen, Book, Megaphone, Sprout, TrendingDown, TrendingUp,
  Search, PencilRuler, Pencil, PenTool, Presentation, Repeat, Sparkles, Building2, Building, Warehouse,
  Store, ListChecks, ClipboardList, ClipboardCheck, Clipboard, CalendarHeart, Calendar, CalendarDays,
  Compass, Quote, Mic, Clock, Timer, Hourglass, Download, Upload, ExternalLink, Link, Link2, Lock,
  Unlock, Key, Fingerprint, ArrowRight, Check, CheckCheck, CheckCircle2, Play, Pause, Clapperboard,
  Film, Video, Music, Camera, Image as ImageIcon, Images, ScrollText, Route, MessageCircle,
  MessageSquare, Mail, Send, Inbox, AtSign, Contact, Phone, PhoneCall, Smartphone, MapPin, MapPinned,
  Map, Navigation, Globe, Globe2, Star, Trophy, Medal, Crown, Award, Target, Gift, FlaskConical,
  TestTube, Atom, Microscope, Stethoscope, Pill, Cross, Recycle, Factory, Home, HardHat, Construction,
  Ruler, Mountain, Wheat, Zap, Battery, Plug, Lightbulb, Droplets, Droplet, Waves, Flame, Snowflake,
  Wind, Thermometer, CloudRain, Cloud, Sun, Moon, Leaf, TreePine, Trees, Flower2, TrainFront, Train,
  Car, Truck, Ship, Plane, Landmark, BadgeCheck, Gauge, Workflow, Scale, Gavel, Banknote, Wallet,
  CreditCard, DollarSign, BarChart3, LineChart, PieChart, Activity, Package, Box, ShoppingCart,
  ShoppingBag, Briefcase, HelpCircle, Info, AlertTriangle, AlertCircle, X, ChevronLeft, ChevronRight,
  Eye, EyeOff, ThumbsUp, Smile, Bell, Flag, Bookmark, Tag, Tags, Folder, FolderOpen, Settings, Cog,
  Wrench, Hammer, Monitor, Laptop, Server, Database, Wifi, Rocket, School, Projector, Edit, Trash2,
  Plus, Minus, Youtube, Instagram,
  type LucideIcon,
} from 'lucide-react';

/**
 * Mapa nome→componente para ícones vindos do CMS (data.icon é string).
 * Catálogo CANÔNICO — manter em sincronia com
 * console/frontend/src/components/cms/iconCatalog.js e o portal gêmeo
 * (apps/rmambiental/src/lib/icons.ts). Todo nome do catálogo resolve aqui.
 */
export const iconByName: Record<string, LucideIcon> = {
  ShieldCheck, ShieldAlert, Shield, HeartPulse, Heart, Infinity: InfinityIcon, Users, Users2, User,
  UserCog, UserCheck, UserPlus, LifeBuoy, HandHeart, Handshake, Brain, FileCheck2, FileCheck, FileText,
  FileSearch, Files, File, GraduationCap, BookOpen, Book, Megaphone, Sprout, TrendingDown, TrendingUp,
  Search, PencilRuler, Pencil, PenTool, Presentation, Repeat, Sparkles, Building2, Building, Warehouse,
  Store, ListChecks, ClipboardList, ClipboardCheck, Clipboard, CalendarHeart, Calendar, CalendarDays,
  Compass, Quote, Mic, Clock, Timer, Hourglass, Download, Upload, ExternalLink, Link, Link2, Lock,
  Unlock, Key, Fingerprint, ArrowRight, Check, CheckCheck, CheckCircle2, Play, Pause, Clapperboard,
  Film, Video, Music, Camera, Image: ImageIcon, Images, ScrollText, Route, MessageCircle,
  MessageSquare, Mail, Send, Inbox, AtSign, Contact, Phone, PhoneCall, Smartphone, MapPin, MapPinned,
  Map, Navigation, Globe, Globe2, Star, Trophy, Medal, Crown, Award, Target, Gift, FlaskConical,
  TestTube, Atom, Microscope, Stethoscope, Pill, Cross, Recycle, Factory, Home, HardHat, Construction,
  Ruler, Mountain, Wheat, Zap, Battery, Plug, Lightbulb, Droplets, Droplet, Waves, Flame, Snowflake,
  Wind, Thermometer, CloudRain, Cloud, Sun, Moon, Leaf, TreePine, Trees, Flower2, TrainFront, Train,
  Car, Truck, Ship, Plane, Landmark, BadgeCheck, Gauge, Workflow, Scale, Gavel, Banknote, Wallet,
  CreditCard, DollarSign, BarChart3, LineChart, PieChart, Activity, Package, Box, ShoppingCart,
  ShoppingBag, Briefcase, HelpCircle, Info, AlertTriangle, AlertCircle, X, ChevronLeft, ChevronRight,
  Eye, EyeOff, ThumbsUp, Smile, Bell, Flag, Bookmark, Tag, Tags, Folder, FolderOpen, Settings, Cog,
  Wrench, Hammer, Monitor, Laptop, Server, Database, Wifi, Rocket, School, Projector, Edit, Trash2,
  Plus, Minus, Youtube, Instagram,
};

/** Resolve um ícone: string (nome do CMS) ou componente (default) → componente. */
export function resolveIcon(v: unknown): LucideIcon {
  if (typeof v === 'function') return v as LucideIcon;
  if (typeof v === 'string' && iconByName[v]) return iconByName[v];
  return Sparkles;
}
