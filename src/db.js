import moment from 'moment'
import _ from 'lodash'

const Validate = require('validate-arguments')

import util from './util.js'

module.exports = bp => {
  return {
    bootstrap: () => {
      return bp.db.get()
      .then(initialize)
    },
    create: (id, options) => {
      return bp.db.get()
      .then(knex => create(knex, id, options))
    },
    update: (id, options) => {
      return bp.db.get()
      .then(knex => update(knex, id, options))
    },
    updateTask: (id, time, status, logs, returned) => {
      return bp.db.get()
      .then(knex => updateTask(knex, id, time, status, logs, returned))
    },
    delete: (id) => {
      return bp.db.get()
      .then(knex => remove(knex, id))
    },
    deleteDone: () => {
      return bp.db.get()
      .then(knex => deleteDone(knex))
    },
    listUpcoming: () => {
      return bp.db.get()
      .then(knex => listUpcoming(knex))
    },
    listPrevious: () => {
      return bp.db.get()
      .then(knex => listPrevious(knex))
    },
    listExpired: () => {
      return bp.db.get()
      .then(knex => listExpired(knex))
    },
    scheduleNext: (id, time) => {
      return bp.db.get()
      .then(knex => scheduleNext(knex, id, time))
    },
    reviveAllExecuting: () => {
      return bp.db.get()
      .then(knex => reviveAllExecuting(knex))
    }
  }
}

function initialize(knex) {
  return knex.schema.createTableIfNotExists('scheduler_schedules', function (table) {
    table.string('id').primary()
    table.boolean('enabled')
    table.string('schedule_type')
    table.string('schedule')
    table.string('schedule_human')
    table.timestamp('created_on')
    table.string('action')
  })
  .then(function() {
    return knex.schema.createTableIfNotExists('scheduler_tasks', function (table) {
      table.string('scheduleId').references('scheduler_schedules.id')
      table.timestamp('scheduledOn')
      table.primary(['scheduleId', 'scheduledOn'])
      table.string('status')
      table.string('logs')
      table.timestamp('finishedOn')
      table.string('returned')
    })
  })
}

function create(knex, id, options) {
  options = validateCreateOptions(options)

  options.schedule_human =
    util.getHumanExpression(options.schedule_type, options.schedule)

  const firstOccurence = util.getNextOccurence(options.schedule_type, options.schedule)

  return knex('scheduler_schedules').insert({
    id: id,
    created_on: moment().format('x'),
    ...options
  })
  .then(() => {
    if (options.enabled) {
      return scheduleNext(knex, id, firstOccurence.format('x'))
    }
  })
}

function update(knex, id, options) {
  options = validateCreateOptions(options)

  return knex('scheduler_schedules')
  .where({ id })
  .update({ ...options })
  .then()
}

function updateTask(knex, id, time, status, logs, returned) {
  const options = { status, logs, returned }

  if (status === 'done' || status === 'error' || status === 'skipped') {
    options.finishedOn = moment().format('x')
  }

  return knex('scheduler_tasks')
  .where({ scheduleId: id, scheduledOn: time })
  .update(options)
  .then()
}

function reviveAllExecuting(knex) {
  return knex('scheduler_tasks')
  .where({ status: 'executing' })
  .update({ status: 'pending' })
  .then()
}

function remove(knex, id) {
  return knex('scheduler_schedules')
  .where({ id })
  .del()
  .then(() => deleteScheduled(knex, id))
}

function listUpcoming(knex) {
  const now = moment().format('x')
  return knex('scheduler_tasks')
  .where({ status: 'pending' })
  .join('scheduler_schedules', 'scheduler_tasks.scheduleId', 'scheduler_schedules.id')
  .then()
}

function listPrevious(knex) {
  const now = moment().format('x')
  return knex('scheduler_tasks')
  .where(knex.raw("julianday('now') >= julianday(scheduledOn/1000, 'unixepoch')"))
  .andWhere('status', '!=', 'pending')
  .join('scheduler_schedules', 'scheduler_tasks.scheduleId', 'scheduler_schedules.id')
  .then()
}

function listExpired(knex) {
  const now = moment().format('x')
  return knex('scheduler_tasks')
  .where(knex.raw("julianday('now') >= julianday(scheduledOn/1000, 'unixepoch')"))
  .andWhere('status', '=', 'pending')
  .join('scheduler_schedules', 'scheduler_tasks.scheduleId', 'scheduler_schedules.id')
  .then()
}

function deleteScheduled(knex, id) {
  return knex('scheduler_tasks')
  .where({ scheduleId: id })
  .del()
  .then()
}

function scheduleNext(knex, id, time) {
  const ts = time.format ? time.format('x') : time
  return knex('scheduler_tasks')
  .insert({ 
    scheduleId: id,
    scheduledOn: ts,
    status: 'pending'
  })
  .then()
}

function deleteDone(knex) {
  return knex('scheduler_tasks')
  .whereNotNull('finishedOn')
  .del()
  .then()
}

function validateCreateOptions(options) {
  const args = Validate.named(options, {
    enabled: 'boolean',
    schedule_type: 'string',
    schedule: 'string',
    action: 'string'
  })

  if(!args.isValid()) {
    throw args.errorString()
  }

  util.validateExpression(options.schedule_type, options.schedule)

  return _.pick(options, [
    'enabled', 
    'schedule_type', 
    'schedule',
    'action'
  ])
}

function validateModifyOptions(options) {
  const args = Validate.named(options, {
    enabled: 'boolean',
    action: 'string'
  })

  if(!args.isValid()) {
    throw args.errorString()
  }

  return _.pick(options, [
    'enabled',
    'action'
  ])
}
