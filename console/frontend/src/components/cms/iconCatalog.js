/**
 * iconCatalog.js — catálogo CANÔNICO de ícones do CMS (lucide ^0.424).
 * ---------------------------------------------------------------------------
 * Fonte única do conjunto de ícones que o editor oferece (IconPicker) E que os
 * portais conseguem renderizar. Os nomes aqui DEVEM existir em
 * apps/<app>/src/lib/icons.ts (iconByName) dos dois portais — todos importam o
 * MESMO conjunto, então qualquer ícone escolhido no editor resolve no portal
 * (sem cair no fallback Sparkles). Ao adicionar/remover um ícone, replique nos
 * dois icons.ts. Imports NOMEADOS (não `import *`) preservam o tree-shaking.
 */
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
} from 'lucide-react';

/** nome (string, como gravado em data.icon) → componente lucide. */
export const ICON_BY_NAME = {
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

/** Lista de nomes (ordem de inserção do mapa). */
export const ICON_CATALOG = Object.keys(ICON_BY_NAME);

/** Termos PT por ícone para a busca achar por significado (além do nome em inglês). */
export const ICON_KEYWORDS = {
  ShieldCheck: 'escudo seguranca protecao conformidade', ShieldAlert: 'escudo alerta risco',
  Shield: 'escudo seguranca', HeartPulse: 'saude batimento coracao pulso', Heart: 'coracao amor saude',
  Infinity: 'infinito continuo', Users: 'usuarios equipe pessoas time', Users2: 'usuarios grupo',
  User: 'usuario pessoa perfil', UserCog: 'usuario config gestor', UserCheck: 'usuario aprovado',
  UserPlus: 'adicionar usuario', LifeBuoy: 'suporte ajuda boia', HandHeart: 'cuidado apoio mao coracao',
  Handshake: 'aperto de mao parceria acordo', Brain: 'cerebro mente neuro', FileCheck2: 'arquivo aprovado documento',
  FileCheck: 'arquivo verificado', FileText: 'documento texto arquivo', FileSearch: 'buscar documento',
  Files: 'arquivos documentos', File: 'arquivo', GraduationCap: 'formatura educacao capacitacao',
  BookOpen: 'livro aberto leitura conteudo', Book: 'livro', Megaphone: 'megafone divulgacao anuncio',
  Sprout: 'broto crescimento muda planta', TrendingDown: 'queda reducao baixa', TrendingUp: 'crescimento alta subida',
  Search: 'busca lupa procurar pesquisa', PencilRuler: 'planejamento regua lapis design',
  Pencil: 'lapis editar', PenTool: 'caneta design', Presentation: 'apresentacao slide palestra',
  Repeat: 'repetir ciclo', Sparkles: 'brilho destaque magia', Building2: 'predio empresa corporativo',
  Building: 'predio construcao', Warehouse: 'galpao armazem', Store: 'loja comercio',
  ListChecks: 'lista tarefas checklist', ClipboardList: 'prancheta lista', ClipboardCheck: 'prancheta aprovado',
  Clipboard: 'prancheta', CalendarHeart: 'calendario evento', Calendar: 'calendario data agenda',
  CalendarDays: 'calendario dias', Compass: 'bussola direcao orientacao', Quote: 'citacao aspas depoimento',
  Mic: 'microfone audio palestra', Clock: 'relogio tempo hora', Timer: 'cronometro tempo',
  Hourglass: 'ampulheta tempo', Download: 'baixar download', Upload: 'enviar upload',
  ExternalLink: 'link externo abrir', Link: 'link corrente', Link2: 'link', Lock: 'cadeado bloqueio seguranca',
  Unlock: 'desbloquear', Key: 'chave acesso', Fingerprint: 'digital biometria',
  ArrowRight: 'seta direita avancar', Check: 'check certo ok aprovado', CheckCheck: 'duplo check',
  CheckCircle2: 'check circulo aprovado', Play: 'play reproduzir video', Pause: 'pausa',
  Clapperboard: 'claquete cinema video', Film: 'filme cinema', Video: 'video filmagem',
  Music: 'musica audio', Camera: 'camera foto', Image: 'imagem foto figura', Images: 'imagens galeria',
  ScrollText: 'pergaminho documento norma lei', Route: 'rota caminho percurso', MessageCircle: 'mensagem chat whatsapp',
  MessageSquare: 'mensagem chat', Mail: 'email carta correio', Send: 'enviar', Inbox: 'caixa de entrada',
  AtSign: 'arroba email', Contact: 'contato', Phone: 'telefone ligar', PhoneCall: 'chamada telefone',
  Smartphone: 'celular telefone', MapPin: 'local pin endereco mapa', MapPinned: 'local fixado',
  Map: 'mapa regiao cobertura', Navigation: 'navegacao direcao', Globe: 'globo mundo internet',
  Globe2: 'mundo planeta', Star: 'estrela favorito destaque', Trophy: 'trofeu premio conquista',
  Medal: 'medalha premio', Crown: 'coroa premium', Award: 'premio certificado selo', Target: 'alvo meta objetivo',
  Gift: 'presente brinde', FlaskConical: 'laboratorio quimica analise frasco', TestTube: 'tubo ensaio laboratorio',
  Atom: 'atomo ciencia', Microscope: 'microscopio analise', Stethoscope: 'estetoscopio saude medico',
  Pill: 'remedio comprimido', Cross: 'cruz saude', Recycle: 'reciclar reciclagem residuo ambiental',
  Factory: 'fabrica industria', Home: 'casa inicio residencia', HardHat: 'capacete obra seguranca',
  Construction: 'construcao obra', Ruler: 'regua medida', Mountain: 'montanha relevo',
  Wheat: 'trigo agro agricultura', Zap: 'raio energia eletrica', Battery: 'bateria energia',
  Plug: 'tomada energia', Lightbulb: 'lampada ideia', Droplets: 'gotas agua', Droplet: 'gota agua',
  Waves: 'ondas agua mar', Flame: 'fogo chama', Snowflake: 'neve frio gelo', Wind: 'vento ar',
  Thermometer: 'termometro temperatura', CloudRain: 'chuva nuvem', Cloud: 'nuvem clima',
  Sun: 'sol solar', Moon: 'lua noite', Leaf: 'folha verde sustentavel ambiental', TreePine: 'arvore pinheiro',
  Trees: 'arvores floresta mata', Flower2: 'flor planta', TrainFront: 'trem ferrovia transporte',
  Train: 'trem ferrovia', Car: 'carro veiculo', Truck: 'caminhao transporte logistica',
  Ship: 'navio barco', Plane: 'aviao voo', Landmark: 'instituicao orgao governo predio publico',
  BadgeCheck: 'selo verificado certificado', Gauge: 'medidor velocimetro indicador', Workflow: 'fluxo processo etapas',
  Scale: 'balanca justica peso', Gavel: 'martelo juridico lei', Banknote: 'dinheiro nota',
  Wallet: 'carteira dinheiro', CreditCard: 'cartao pagamento', DollarSign: 'dinheiro cifrao valor',
  BarChart3: 'grafico barras dados', LineChart: 'grafico linha tendencia', PieChart: 'grafico pizza',
  Activity: 'atividade pulso monitor', Package: 'pacote entrega caixa produto', Box: 'caixa',
  ShoppingCart: 'carrinho compras', ShoppingBag: 'sacola compras', Briefcase: 'maleta trabalho negocios',
  HelpCircle: 'ajuda duvida interrogacao', Info: 'informacao', AlertTriangle: 'alerta aviso atencao',
  AlertCircle: 'alerta erro', X: 'fechar x cancelar', ChevronLeft: 'anterior esquerda', ChevronRight: 'proximo direita',
  Eye: 'olho visualizar ver', EyeOff: 'ocultar esconder', ThumbsUp: 'curtir positivo joinha',
  Smile: 'sorriso feliz', Bell: 'sino notificacao', Flag: 'bandeira marcador', Bookmark: 'marcador salvar',
  Tag: 'etiqueta tag categoria', Tags: 'etiquetas tags', Folder: 'pasta diretorio', FolderOpen: 'pasta aberta',
  Settings: 'configuracoes ajustes engrenagem', Cog: 'engrenagem config', Wrench: 'chave ferramenta manutencao',
  Hammer: 'martelo ferramenta', Monitor: 'monitor tela computador', Laptop: 'notebook computador',
  Server: 'servidor', Database: 'banco de dados', Wifi: 'wifi rede internet', Rocket: 'foguete lancamento startup',
  School: 'escola educacao', Projector: 'projetor apresentacao', Edit: 'editar', Trash2: 'lixeira excluir apagar',
  Plus: 'mais adicionar', Minus: 'menos remover', Youtube: 'youtube video', Instagram: 'instagram rede social',
};

const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Filtra o catálogo por nome (en) ou palavra-chave (pt), ignorando acentos. */
export function searchIcons(query) {
  const q = norm(query).trim();
  if (!q) return ICON_CATALOG;
  return ICON_CATALOG.filter((name) => norm(name).includes(q) || norm(ICON_KEYWORDS[name]).includes(q));
}
