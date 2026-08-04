(function(global){
  'use strict';

  class WorkflowEngine {
    constructor(){
      this.phaseLibrary = new Map();
    }

    registerPhase(phase){
      this.validatePhase(phase);
      const key = `${phase.id}@${phase.version}`;
      this.phaseLibrary.set(key, structuredClone(phase));
      return key;
    }

    registerPhases(phases){
      return phases.map(phase => this.registerPhase(phase));
    }

    getPhase(id, version){
      if(version){
        const phase = this.phaseLibrary.get(`${id}@${version}`);
        if(!phase) throw new Error(`Fase non trovata: ${id}@${version}`);
        return structuredClone(phase);
      }
      const matches = [...this.phaseLibrary.entries()]
        .filter(([key]) => key.startsWith(`${id}@`))
        .sort((a,b) => Number(b[0].split('@')[1]) - Number(a[0].split('@')[1]));
      if(!matches.length) throw new Error(`Fase non trovata: ${id}`);
      return structuredClone(matches[0][1]);
    }

    composeSession(definition){
      if(!definition || !definition.id || !definition.title) throw new Error('Sessione non valida.');
      if(!Array.isArray(definition.phases) || !definition.phases.length) throw new Error('La sessione deve contenere almeno una fase.');
      const phases = definition.phases.map((item,index) => {
        const phase = typeof item === 'string' ? this.getPhase(item) : structuredClone(item);
        this.validatePhase(phase);
        return {...phase, order: index + 1};
      });
      return {
        id: definition.id,
        title: definition.title,
        version: definition.version || 1,
        status: definition.status || 'draft',
        context: structuredClone(definition.context || {}),
        phases,
        estimated_minutes: phases.reduce((sum,p) => sum + p.estimated_minutes, 0),
        created_at: definition.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
    }

    buildTimeline(session,startAt){
      const start = new Date(startAt || Date.now());
      if(Number.isNaN(start.getTime())) throw new Error('Data di inizio non valida.');
      let cursor = new Date(start);
      return session.phases.map(phase => {
        const phaseStart = new Date(cursor);
        cursor = new Date(cursor.getTime() + phase.estimated_minutes * 60000);
        return {...structuredClone(phase), starts_at: phaseStart.toISOString(), ends_at: cursor.toISOString()};
      });
    }

    createRuntime(session){
      return {
        session_id: session.id,
        status: 'planned',
        current_phase_index: 0,
        checklist: {},
        timers: {},
        notes: {},
        photos: {},
        started_at: null,
        completed_at: null
      };
    }

    validatePhase(phase){
      const required = ['id','version','type','title','estimated_minutes','instructions'];
      required.forEach(field => { if(phase?.[field] === undefined || phase[field] === null) throw new Error(`Campo fase mancante: ${field}`); });
      if(!Array.isArray(phase.instructions) || !phase.instructions.length) throw new Error(`La fase ${phase.id} deve avere istruzioni.`);
      if(!Number.isInteger(phase.estimated_minutes) || phase.estimated_minutes < 0) throw new Error(`Durata non valida per ${phase.id}.`);
      return true;
    }
  }

  global.CucinaHubWorkflowEngine = WorkflowEngine;
})(window);