var util = require('util')
var chalk = require('chalk')
var List = require('inquirer/lib/prompts/list')
var observe = require('inquirer/lib/utils/events')
var Choices = require('inquirer/lib/objects/choices')
var fuzzy = require('fuzzy')
var cliCursor = require('cli-cursor')

module.exports = Prompt

function Prompt (opt) {
  List.apply(this, arguments)
  this._allowOther = opt.allowOther
  this._initialChoices = [].concat(this.opt.choices.choices)
}
util.inherits(Prompt, List)

Prompt.prototype._run = function (cb) {
  this.done = cb

  var events = observe(this.rl)
  events.normalizedUpKey.forEach(this.onUpKey.bind(this))
  events.normalizedDownKey.forEach(this.onDownKey.bind(this))
  events.line.forEach(this.onSubmit.bind(this))
  events.keypress.forEach(this.onKeypress.bind(this))

  cliCursor.hide()
  this.render()
  return this
}

Prompt.prototype.render = function () {
  // Render question
  var message = this.getQuestion()

  if (this.firstRender) { message += chalk.dim('(Type or use arrow keys)') }

  // Render choices or answer depending on the state
  if (this.status === 'answered') {
    message += chalk.cyan(this._completedAnswer.short)
  } else {
    message += '\n' + this.rl.line
    var choicesStr = listRender(this.opt.choices, this.selected)
    var indexPosition = this.opt.choices.indexOf(this.opt.choices.getChoice(this.selected))
    message += '\n' + this.paginator.paginate(choicesStr, indexPosition, this.opt.pageSize)
  }

  this.firstRender = false

  this.screen.render(message)
}

Prompt.prototype.onNumberKey = function () { return }

Prompt.prototype.onKeypress = function (e) {
  if (this.rl.line) {
    this._typedAnswer = this.rl.line
    var matches = fuzzy.filter(this.rl.line, this._initialChoices, {
      extract: (c) => c.name
    })
    .map((m) => m.original)
    this.opt.choices = new Choices(matches)
  } else {
    this.opt.choices = new Choices(this._initialChoices)
  }
  this.render()
}

Prompt.prototype.onSubmit = function () {
  var choice = this.opt.choices.getChoice(this.selected)
  if (!choice && !this._allowOther) {
    this.onKeypress()
    return
  }

  this._completedAnswer = choice || {
    short: this._typedAnswer,
    name: this._typedAnswer,
    value: this._typedAnswer
  }

  this.status = 'answered'

  // Rerender prompt
  this.render()

  this.screen.done()
  cliCursor.show()
  this.done(this._completedAnswer.value)
}

function listRender (choices, pointer) {
  var output = ''
  var separatorOffset = 0

  choices.forEach(function (choice, i) {
    if (choice.type === 'separator') {
      separatorOffset++
      output += '  ' + choice + '\n'
      return
    }

    var isSelected = (i - separatorOffset === pointer)
    var line = (isSelected ? '> ' : '  ') + choice.name
    if (isSelected) {
      line = chalk.cyan(line)
    }
    output += line + ' \n'
  })

  return output.replace(/\n$/, '')
}
