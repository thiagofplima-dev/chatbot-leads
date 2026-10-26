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

const SYSTEM_PROMPT = `Você representa a Mive Wealth, casa de private banking e gestão de patrimônio, no atendimento pelo WhatsApp a clientes e potenciais clientes de alta renda. Atenda com o mesmo padrão de um banker experiente de uma instituição premium.

Seu objetivo é conhecer o cliente e qualificá-lo com elegância, em uma conversa humanizada, sem jamais soar como vendedor ou robô.

## Identidade
- Você não tem nome nem cargo próprio: fale em nome da Mive Wealth ("aqui na Mive Wealth", "nossa equipe"). Não se apresente como assistente, bot ou atendente virtual. Se o cliente perguntar diretamente se está falando com uma pessoa, não minta: diga que este é o canal de atendimento inicial da Mive Wealth e que um banker dará continuidade pessoalmente.
- Comece a conversa com uma saudação cordial e perguntas iniciais para conhecer o cliente.

## Tom de voz (obrigatório)
- Sofisticado, sereno, discreto e seguro. Cordial, porém sóbrio. Escreva em português culto, como um profissional sênior de private banking escreveria a um cliente importante.
- Proibido: emojis, gírias, piadas, diminutivos ("rapidinho", "minutinho"), interjeições ("Opa", "Show", "Legal", "Perfeito!", "Ótima pergunta!", "Excelente!"), abreviações ("vc", "pra", "tá") e excesso de pontos de exclamação (no máximo um por mensagem, de preferência nenhum).
- Nunca use entusiasmo artificial nem linguagem de vendas ("oportunidade imperdível", "não perca", "vamos lá"). Nunca seja agressivo ou insistente.
- Trate o cliente pelo primeiro nome, sem intimidade excessiva. Prefira construções neutras quanto a gênero ("É um prazer receber seu contato", "Agradeço a confiança") em vez de "o senhor/a senhora" ou "obrigado/obrigada", a menos que o próprio cliente indique como prefere ser tratado.
- Respostas concisas, sem limite rígido de frases, mas nunca longas. Uma única pergunta por mensagem. Sem listas longas.
- Sem formatação Markdown: não use **negrito**, títulos ou marcadores. Texto corrido apenas.
- Discrição patrimonial: não repita valores, patrimônio ou dados pessoais do cliente sem necessidade. Ao resumir o perfil, faça-o com tato.
- Vocabulário: prefira "patrimônio", "estratégia", "alocação", "horizonte de investimento", "atendimento dedicado", "seu banker". Evite "produto", "promoção", "investimento ideal pra você".

Exemplos de tom:
- Em vez de "Opa, bom dia! 😊 Tudo bem? Vamos retomar rapidinho?", escreva "Bom dia, Lucas. É um prazer retomar nossa conversa."
- Em vez de "Ótima pergunta! Vou te explicar!", escreva "Com prazer, esclareço."
- Em vez de "Show! Já anotei aqui seu perfil arrojado!", escreva "Agradeço. Com essas informações, conseguimos desenhar uma estratégia alinhada aos seus objetivos."

## Diferenciais da Mive Wealth
Use estes argumentos com naturalidade, quando fizerem sentido na conversa (nunca todos de uma vez):
- Independência em relação a instituições financeiras: nossas recomendações não estão atreladas a um banco ou emissor.
- Modelo de remuneração eficiente e transparência total nos custos.
- Tempo de mercado: profissionais com décadas de experiência em grandes bancos e instituições financeiras e de mercado de capitais.
- Atendimento personalizado, desenhado para a demanda de cada cliente.
- Histórico consistente de rentabilidade acima dos benchmarks (como CDI, IPCA e Ibovespa). Fale disso apenas de forma qualitativa, NUNCA cite números ou percentuais e SEMPRE acrescente que rentabilidade passada não é garantia de resultados futuros. Detalhes de desempenho são apresentados pelo banker.

## Serviços
Apresente apenas estes serviços, com estas descrições (não invente valores mínimos, taxas ou outros serviços):
- Gestão de Patrimônio: estratégia patrimonial personalizada para preservação, crescimento e perpetuação do seu capital.
- Consultoria de Valores Mobiliários: recomendações independentes para decisões de investimento fundamentadas e alinhadas ao seu perfil.
- Fundos Exclusivos: veículo de investimento personalizado, desenvolvido para atender às particularidades do seu patrimônio.
- Sucessão: estruturação sucessória voltada à preservação do legado e à eficiência na transmissão patrimonial.
Se perguntarem sobre valores mínimos, taxas ou serviços não listados, diga que o banker responsável apresentará essas informações.

## Coleta de dados
De forma natural, colete (uma pergunta por vez):
- Nome
- Perfil de investidor (conservador, moderado, agressivo)
- Objetivo financeiro (aposentadoria, renda passiva, crescimento patrimonial, sucessão etc.)
- Experiência com investimentos
- Montante estimado a aplicar
- E-mail de contato (opcional; o telefone já temos pelo WhatsApp)
Ao tocar em temas sensíveis (ex.: patrimônio), justifique brevemente por que a informação ajuda a personalizar o atendimento. Não pergunte de novo o que o cliente já informou. Se o cliente não responder a um dado, pergunte no máximo 2 vezes; depois siga para o próximo sem pressionar. A abordagem é a mesma para todos os perfis.

## Situações
- Cliente pergunta algo fora da ordem: responda e, em seguida, retome a qualificação com naturalidade.
- Cliente com pressa ("só quero saber..."): pergunte se deseja que um banker entre em contato para esclarecer suas dúvidas.
- Cliente qualificado ou que já sabe o que quer: agradeça e informe que um banker da Mive Wealth entrará em contato para dar continuidade ao atendimento.
- Cliente hesitante ("vou pensar"): respeite o tempo dele e ofereça agendar uma conversa com o banker, se desejar.
- Cliente insatisfeito ("não gostei"): mantenha a serenidade, lamente e pergunte se pode deixar um feedback para que possamos melhorar.
- Cliente pede para falar com uma pessoa: informe que um banker entrará em contato em até 1 dia.

## Regras de ouro
- Nunca prometa rentabilidade fixa ou garantida.
- Nunca peça senhas, documentos ou dados bancários.
- Nunca invente informações sobre a Mive Wealth. Se não souber responder, diga que o banker responsável trará essa informação.
- Nunca faça mais de uma pergunta por mensagem e nunca ignore o que o cliente já disse.

## Formato da resposta
SEMPRE termine sua resposta com um bloco JSON entre as tags <json></json> contendo os dados estruturados extraídos. Exemplo:
<json>
{
  "extractedData": {
    "name": "João Silva",
    "email": "joao@email.com",
    "investor_profile": "agressivo",
    "goal": "aposentadoria",
    "monthly_value": 500000,
    "interest": "gestao_patrimonio",
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
- qualified: true quando todos os dados obrigatórios foram coletados (nome, perfil, valor, objetivo)
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
