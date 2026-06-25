import axios from 'axios';
import { config } from '../config';

export interface DeepSeekMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface DeepSeekResponse {
  choices: {
    message: {
      content: string;
    };
  }[];
}

export interface DeepSeekProcessedResponse {
  message: string;
  stage?: string;
  qualified?: boolean;
  qualificationScore?: number;
  action?: 'generate_proposal' | 'notify_team' | 'continue';
  extractedData?: {
    name?: string;
    email?: string;
    investor_profile?: string;
    experience?: string;
    goal?: string;
    timeline?: string;
    monthly_value?: number;
    interest?: string | string[];
    interest_details?: string;
    allow_contact?: boolean;
    [key: string]: any;
  };
  metadata?: Record<string, any>;
}

const SYSTEM_PROMPT = `Você é um assistente de pré-qualificação da KEA Wealth Management, especializada em private banking e gestão de patrimônio.

Seu objetivo é qualificar leads interessados em investimentos de forma natural e conversacional. Siga estas diretrizes:

1. **Apresentação**: Se for o primeiro contato, apresente a KEA Wealth Management de forma sucinta.
2. **Coleta de dados**: De forma natural, colete:
   - Nome completo
   - Perfil de investidor (conservador, moderado, arrojado)
   - Montante disponível para investir
   - Objetivo financeiro (aposentadoria, renda passiva, crescimento patrimonial, etc.)
   - Experiência com investimentos
   - Contato (email/telefone)
3. **Tom**: Seja cordial, profissional e objetivo. Use português formal mas acessível.
4. **Condução**: Se faltam dados, faça perguntas naturais (uma de cada vez). Se já tem todos os dados, resuma o perfil e indique que um consultor especializado entrará em contato.
5. **Formato da resposta**: SEMPRE termine sua resposta com um bloco JSON entre as tags <json></json> contendo os dados estruturados extraídos. Exemplo:
<json>
{
  "extractedData": {
    "name": "João Silva",
    "email": "joao@email.com",
    "investor_profile": "arrojado",
    "goal": "aposentadoria",
    "monthly_value": 500000,
    "interest": "ações",
    "allow_contact": true
  },
  "stage": "chatting",
  "qualified": false,
  "action": "continue"
}
</json>

Campos do JSON:
- extractedData: dados extraídos da conversa (apenas os confirmados)
- stage: estágio atual (welcome, presentation, investor_profile, financial_goal, contact_info, qualification, proposal)
- qualified: true quando todos os dados obrigatórios foram coletados (nome, perfil, valor, objetivo, contato)
- qualificationScore: 0-100 baseado na qualidade do lead
- action: "continue" (continua conversa), "generate_proposal" (gera proposta), "notify_team" (notifica equipe)`;

class DeepSeekService {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = config.deepseek.apiKey;
    this.baseUrl = config.deepseek.baseUrl;
  }

  /**
   * Call DeepSeek API to process a user message and generate a response
   */
  async processMessage(input: {
    leadId: number;
    phone: string;
    leadName: string | null;
    message: string;
    conversationHistory: { role: string; content: string }[];
    currentProfile: any;
    currentInterests: any[];
  }): Promise<DeepSeekProcessedResponse> {
    try {
      // Build conversation context
      const contextLines: string[] = [];
      
      if (input.leadName) {
        contextLines.push(`Nome do lead: ${input.leadName}`);
      }
      if (input.currentProfile) {
        const p = input.currentProfile;
        if (p.investor_profile) contextLines.push(`Perfil de investidor: ${p.investor_profile}`);
        if (p.goal) contextLines.push(`Objetivo financeiro: ${p.goal}`);
        if (p.monthly_value) contextLines.push(`Valor disponível: R$ ${p.monthly_value}`);
        if (p.experience) contextLines.push(`Experiência: ${p.experience}`);
        if (p.timeline) contextLines.push(`Horizonte: ${p.timeline}`);
      }
      if (input.currentInterests?.length > 0) {
        const interests = input.currentInterests.map((i: any) => i.interest_type).join(', ');
        contextLines.push(`Interesses: ${interests}`);
      }

      const contextBlock = contextLines.length > 0
        ? `\n[DADOS JÁ COLETADOS DO LEAD]\n${contextLines.join('\n')}\n[/DADOS]\n`
        : '';

      // Build messages array
      const messages: DeepSeekMessage[] = [
        { role: 'system', content: SYSTEM_PROMPT },
      ];

      // Add conversation history (last 15 messages to avoid token limit)
      const recentHistory = input.conversationHistory.slice(-15);
      for (const msg of recentHistory) {
        messages.push({ role: msg.role as 'user' | 'assistant', content: msg.content });
      }

      // Add context as system message
      if (contextBlock) {
        messages.push({ role: 'system', content: contextBlock });
      }

      // Add current message
      messages.push({ role: 'user', content: input.message });

      // Call DeepSeek API
      console.log('🤖 Calling DeepSeek API...');
      const response = await axios.post<DeepSeekResponse>(
        `${this.baseUrl}/chat/completions`,
        {
          model: 'deepseek-chat',
          messages,
          temperature: 0.7,
          max_tokens: 800,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      const content = response.data.choices[0]?.message?.content || '';
      console.log(`✅ DeepSeek response: ${content.substring(0, 150)}...`);

      // Parse the response
      return this.parseResponse(content);
    } catch (error: any) {
      console.error('❌ DeepSeek API error:', error.response?.data || error.message);
      return {
        message: 'Desculpe, estou com dificuldades técnicas no momento. Por favor, tente novamente em alguns instantes.',
        stage: 'error',
        qualified: false,
        action: 'continue',
      };
    }
  }

  /**
   * Parse DeepSeek response to extract the message and structured data
   */
  private parseResponse(content: string): DeepSeekProcessedResponse {
    try {
      // Extract JSON block if present
      const jsonMatch = content.match(/<json>([\s\S]*?)<\/json>/);
      
      let cleanMessage = content;
      let structuredData: any = {};

      if (jsonMatch) {
        // Remove the JSON block from the message
        cleanMessage = content.replace(/<json>[\s\S]*?<\/json>/, '').trim();
        
        try {
          structuredData = JSON.parse(jsonMatch[1].trim());
        } catch (e) {
          console.warn('⚠️ Failed to parse JSON block from DeepSeek response');
        }
      }

      return {
        message: cleanMessage || 'Olá! Como posso ajudá-lo com seus investimentos hoje?',
        stage: structuredData.stage || 'chatting',
        qualified: structuredData.qualified || false,
        qualificationScore: structuredData.qualificationScore,
        action: structuredData.action || 'continue',
        extractedData: structuredData.extractedData,
        metadata: structuredData,
      };
    } catch (error) {
      console.error('❌ Error parsing DeepSeek response:', error);
      return {
        message: content,
        stage: 'chatting',
        qualified: false,
        action: 'continue',
      };
    }
  }
}

export const deepseekService = new DeepSeekService();
