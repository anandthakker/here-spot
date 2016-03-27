var util = require('util')
var chalk = require('chalk')
var List = require('inquirer/lib/prompts/list')
var observe = require('inquirer/lib/utils/events')
var Choices = require('inquirer/lib/objects/choices')

module.exports = Prompt

function Prompt () {
  List.apply(this, arguments)
  this._initialChoices = [].concat(this.opt.choices.choices)
}
util.inherits(Prompt, List)

Prompt.prototype._run = function (cb) {
  List.prototype._run.call(this, cb)
  var events = observe(this.rl)
  events.keypress.forEach(this.onKeypress.bind(this))
  return this
}

Prompt.prototype.render = function () {
  // Render question
  var message = this.getQuestion()

  if (this.firstRender) { message += chalk.dim('(Use arrow keys)') }

  // Render choices or answer depending on the state
  if (this.status === 'answered') {
    message += chalk.cyan(this.opt.choices.getChoice(this.selected).short)
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
  this.opt.choices = new Choices(this._initialChoices.filter((choice) => {
    return !this.rl.line || choice.value.startsWith(this.rl.line)
  }))
  this.render()
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
