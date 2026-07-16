import fs from 'fs';
import path from 'path';
import { config } from '../config';

interface ProposalInput {
  lead: {
    id: number;
    name: string | null;
    phone: string;
    [key: string]: any;
  };
  profile: {
    investor_profile?: string;
    goal?: string;
    monthly_value?: number;
    [key: string]: any;
  } | null;
  interests: {
    interest_type: string;
    [key: string]: any;
  }[];
  extractedData: Record<string, any>;
}

class ProposalGenerator {
  private templatePath: string;
  private outputDir: string;

  constructor() {
    this.templatePath = path.resolve(__dirname, '..', '..', 'templates', 'proposta-template.html');
    this.outputDir = path.resolve(__dirname, '..', '..', 'storage', 'propostas');
  }

  /**
   * Generate a personalized proposal HTML file
   */
  async generate(input: ProposalInput): Promise<string> {
    // Ensure output directory exists
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    // Read the template
    let html = fs.readFileSync(this.templatePath, 'utf8');

    // Prepare data for injection
    const leadName = input.lead.name || 'Cliente';
    const today = new Date().toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
    const assessor = process.env.PROPOSAL_ADVISOR_NAME || 'Equipe Mive Wealth';

    // Map investor profile to risk level (1-5)
    const riskMap: Record<string, number> = {
      conservador: 2,
      moderado: 3,
      agressivo: 5,
    };
    const investorProfile = input.profile?.investor_profile || input.extractedData?.investor_profile || 'moderado';
    const riskLevel = riskMap[investorProfile] || 3;

    // Monthly value or estimated wealth
    const monthlyValue = input.profile?.monthly_value || input.extractedData?.monthly_value || 0;
    const estimatedWealth = monthlyValue > 0
      ? `R$ ${(monthlyValue * 12 * 5).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
      : 'A definir';

    console.log(`📄 Generating proposal for ${leadName}...`);

    // Apply replacements to the template HTML
    // The template stores data in JavaScript variables
    html = this.replaceField(html, 'clientName', leadName);
    html = this.replaceField(html, 'clientDate', today);
    html = this.replaceField(html, 'patrimonio', estimatedWealth);
    html = this.replaceField(html, 'risco', String(riskLevel));
    html = this.replaceField(html, 'assessor', assessor);

    // If we have interests, try to set up building blocks based on profile
    const interests = input.interests.map(i => i.interest_type);
    if (interests.length > 0) {
      html = this.injectBuildingBlocks(html, interests, investorProfile);
    }

    // Generate filename
    const safeName = leadName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    const filename = `proposta_${safeName}_${Date.now()}.html`;
    const outputPath = path.join(this.outputDir, filename);

    // Save the file
    fs.writeFileSync(outputPath, html, 'utf8');
    console.log(`✅ Proposal saved: ${outputPath}`);

    // Return the public URL
    const baseUrl = config.isDev
      ? `http://localhost:${config.port}`
      : `https://${process.env.RAILWAY_PUBLIC_DOMAIN || 'localhost'}`;

    return `${baseUrl}/propostas/${filename}`;
  }

  /**
   * Replace a variable value in the template JavaScript
   * Searches for patterns like: clientName: 'value' or clientName = 'value'
   */
  private replaceField(html: string, fieldName: string, newValue: string): string {
    // Pattern 1: fieldName: 'value' (object property)
    const regex1 = new RegExp(`(${fieldName}\\s*:\\s*)'[^']*'`);
    html = html.replace(regex1, `$1'${this.escapeHtml(newValue)}'`);

    // Pattern 2: fieldName = 'value' (variable assignment)
    const regex2 = new RegExp(`(${fieldName}\\s*=\\s*)'[^']*'`);
    html = html.replace(regex2, `$1'${this.escapeHtml(newValue)}'`);

    // Pattern 3: "fieldName": "value" (JSON-like)
    const regex3 = new RegExp(`("${fieldName}"\\s*:\\s*)"[^"]*"`);
    html = html.replace(regex3, `$1"${this.escapeHtml(newValue)}"`);

    return html;
  }

  /**
   * Inject building blocks based on lead interests
   */
  private injectBuildingBlocks(html: string, interests: string[], profile: string): string {
    // Map interests to building block IDs
    const interestToBlock: Record<string, string[]> = {
      'renda_fixa': ['cdi_isento', 'cdi_alloc', 'ima_b5'],
      'acoes': ['acoes'],
      'fundos': ['mm', 'fii_multi'],
      'imobiliario': ['fii_multi', 'fii_tijolo'],
      'previdencia': ['cdi_isento', 'inf2032'],
      'multimercado': ['mm'],
      'cripto': [],
      'gestao_patrimonio': ['cdi_isento', 'inf2032', 'inf2045', 'fii_multi', 'mm'],
      'consultoria': ['cdi_isento', 'inf2032', 'mm'],
      'planejamento': ['cdi_isento', 'inf2032', 'inf2045', 'fii_multi', 'mm'],
      'fundos_exclusivos': ['mm', 'acoes'],
      'sucessao': ['inf2045', 'inf2032', 'cdi_isento'],
    };

    let selectedBlocks: string[] = [];
    for (const interest of interests) {
      const blocks = interestToBlock[interest] || [];
      selectedBlocks.push(...blocks);
    }

    // Remove duplicates
    selectedBlocks = [...new Set(selectedBlocks)];

    if (selectedBlocks.length === 0) {
      return html;
    }

    // Profile-based allocation
    const allocation: Record<string, Record<string, number>> = {
      conservador: { cdi_isento: 35, cdi_alloc: 10, ima_b5: 10, inf2032: 25, inf2045: 10, fii_multi: 5, mm: 5 },
      moderado: { cdi_isento: 25, cdi_alloc: 5, ima_b5: 5, inf2032: 25, inf2045: 15, fii_multi: 10, mm: 15 },
      agressivo: { cdi_isento: 15, inf2032: 20, inf2045: 15, fii_multi: 15, mm: 20, acoes: 15 },
    };

    const alloc = allocation[profile] || allocation.moderado;

    // Build the bbState array injection
    const bbState = selectedBlocks.map((blockId, index) => {
      const pct = alloc[blockId] || Math.round(100 / selectedBlocks.length);
      return `{id:'${blockId}',selected:true,pct:${pct}}`;
    }).join(',');

    // Try to inject into bbState declaration
    const bbRegex = /(bbState\s*=\s*\[)[^\]]*(\])/;
    html = html.replace(bbRegex, `$1${bbState}$2`);

    const bbRegex2 = /(var\s+bbState\s*=\s*\[)[^\]]*(\])/;
    html = html.replace(bbRegex2, `$1${bbState}$2`);

    return html;
  }

  /**
   * Basic HTML escaping
   */
  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/'/g, '&#39;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}

export const proposalGenerator = new ProposalGenerator();
