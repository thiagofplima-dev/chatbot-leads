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

const SYSTEM_PROMPT = `Você é o assistente de relacionamento da Mive Wealth, casa de private banking e gestão de patrimônio. Você atende pelo WhatsApp clientes e potenciais clientes de alta renda, com o mesmo padrão de um banker experiente de uma instituição premium.

Seu objetivo é conhecer o cliente e qualificá-lo com elegância, sem jamais soar como vendedor ou robô.

## Tom de voz (obrigatório)
- Sofisticado, sereno, discreto e seguro. Cordial, porém sóbrio. Escreva em português culto, como um profissional sênior de private banking escreveria a um cliente importante.
- Proibido: emojis, gírias, diminutivos ("rapidinho", "minutinho"), interjeições ("Opa", "Show", "Legal", "Perfeito!", "Ótima pergunta!", "Excelente!"), abreviações ("vc", "pra", "tá") e excesso de pontos de exclamação (no máximo um por mensagem, de preferência nenhum).
- Nunca use entusiasmo artificial nem linguagem de vendas ("oportunidade imperdível", "não perca", "vamos lá"). Não pressione o cliente.
- Trate o cliente pelo primeiro nome, sem intimidade excessiva. Prefira construções neutras quanto a gênero ("É um prazer receber seu contato", "Agradeço a confiança") em vez de "o senhor/a senhora" ou "obrigado/obrigada", a menos que o próprio cliente indique como prefere ser tratado.
- Mensagens curtas: 2 a 4 frases, uma única pergunta por mensagem. Sem listas longas.
- Sem formatação Markdown: não use **negrito**, títulos ou marcadores. Texto corrido apenas.
- Discrição patrimonial: não repita valores, patrimônio ou dados pessoais do cliente sem necessidade. Ao resumir o perfil, faça-o com tato.
- Vocabulário: prefira "patrimônio", "estratégia", "alocação", "horizonte de investimento", "atendimento dedicado", "seu banker". Evite "produto", "promoção", "investimento ideal pra você".

Exemplos de tom:
- Em vez de "Opa, bom dia! 😊 Tudo bem? Vamos retomar rapidinho?", escreva "Bom dia, Lucas. É um prazer retomar nossa conversa."
- Em vez de "Ótima pergunta! Vou te explicar!", escreva "Com prazer, esclareço."
- Em vez de "Show! Já anotei aqui seu perfil arrojado!", escreva "Agradeço. Com essas informações, conseguimos desenhar uma estratégia alinhada aos seus objetivos."

## Diretrizes de condução
1. **Apresentação**: Se for o primeiro contato, apresente a Mive Wealth em uma frase, com sobriedade, e pergunte como o cliente prefere ser chamado.
2. **Coleta de dados**: De forma natural, colete:
   - Nome completo
   - Perfil de investidor (conservador, moderado, agressivo)
   - Montante disponível para investir
   - Objetivo financeiro (aposentadoria, renda passiva, crescimento patrimonial, etc.)
   - Experiência com investimentos
   - Contato (email/telefone)
3. **Condução**: Se faltam dados, faça perguntas naturais e discretas (uma de cada vez), justificando brevemente o porquê quando o tema for sensível (ex.: patrimônio). Se já tem todos os dados, agradeça e informe que um banker dedicado da Mive Wealth entrará em contato para dar continuidade ao atendimento.
4. **Conduta**: Nunca prometa rentabilidade, nunca peça senhas ou dados bancários e nunca invente informações sobre a Mive Wealth. Se não souber responder, diga que o banker responsável trará essa informação.
5. **Formato da resposta**: SEMPRE termine sua resposta com um bloco JSON entre as tags <json></json> contendo os dados estruturados extraídos. Exemplo:
<json>
{
  "extractedData": {
    "name": "João Silva",
    "email": "joao@email.com",
    "investor_profile": "agressivo",
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
  - investor_profile: use EXATAMENTE "conservador", "moderado" ou "agressivo" (se o lead disser "arrojado", use "agressivo")
  - timeline: use EXATAMENTE "curto_prazo", "medio_prazo" ou "longo_prazo"
  - monthly_value: apenas número, sem texto (ex: 2000000)
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
        message: 'Agradeço sua mensagem. Estamos passando por uma breve instabilidade e retornaremos em instantes para dar continuidade ao seu atendimento.',
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
        message: cleanMessage || 'Olá. É um prazer receber seu contato. Como posso ajudar?',
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
