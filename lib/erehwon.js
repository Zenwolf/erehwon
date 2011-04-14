var mingy = require('mingy')
  , Parser = mingy.Parser
  , Command = mingy.Command
  , Shell = mingy.Shell
  , util = require('util')
  , EventEmitter = require('events').EventEmitter

/*
 * Keep track of the user names so there are no duplicates.
 *
 */
var userNames = {}

function MsgChannel() {}
util.inherits(MsgChannel, EventEmitter)
var msgChannel = new MsgChannel()

/*
 * Locations.
 *
 */
function Location() {}
var locations = {}

var hallway = new Location()
hallway.desc = "You are in a long hallway. From here you can go north."
hallway.exits = {'north' : 'room' }
locations['hallway'] = hallway

var room = new Location()
room.desc = "You are in an oval room filled with windows. A peaceful serenity pervades the atmosphere. From here you can go south and west."
room.exits = {'south' : 'hallway'
             , 'west' : 'courtyard'
             }
locations['room'] = room

var courtyard = new Location()
courtyard.desc = "You find yourself in a courtyard surrounded with stone walls adorned with ivy. A fountain rises from the ground in the center. From here you can go east."
courtyard.exits = {'east' : 'room' }
locations['courtyard'] = courtyard

/*
 * Logic functions.
 *
 */
function lookLogic(args, env, system) {
    var _userID = system.stream.userID
      , _user = env.users[_userID]
      , name = _user.name
      , loc = _user.location
      , msg = []
      , usersStr = ''
      , isFirst = true

    // Describe the location.
    msg.push('\n' + env.locations[loc].desc)

    // Describe nearby users.
    for ( var uID in env.users) {
        var u = env.users[uID]
        if ( (uID === _userID) || u.location !== loc ) {
            continue
        }
        if (!isFirst) usersStr += ", "
        else {
            isFirst = false
            usersStr += "You see "
        }
        usersStr += u.name
    }
    if (usersStr !== '') usersStr += '.\n'
    msg.push(usersStr)
    return msg.join('\n')
}

function quitLogic(args, env, system) {
    var user = env.users[system.stream.userID]
    broadcast(user.name + " fades into the void...\n", user)
    delete env.users[system.stream.userID]
    delete system.stream.userID
    return "Goodbye!\n"
}

function helpLogic(args) {
    return [ 'You can use the following commands:'
           , '  "look" (or "l") to look around.'
           , '  "go <direction>" to walk in a direction.'
           , '  "say <something>" to say some things.'
           , '  "quit" (or "exit") to quit.'
           , '  "nick <name>" to give yourself a nickname.\n'
           ].join('\n')
}

function nickLogic(args, env, system) {
    var nick = args['username']
      , id = system.stream.userID
      , user = env.users[id]
      , oldName = user.name
    
    user.name = nick
    userNames[nick] = id
    broadcast(oldName + " is now known as " + nick + ".\n", user)
    return "You are now known as " + nick + ".\n"
}

function sayLogic(args, env, system) {
    var _userID = system.stream.userID
      , _user = env.users[_userID]
      , name = _user.name
      , loc = _user.location
      , msg = args['message*']

    // broadcast to nearby users
    /*
    for (var uID in env.users) {
        var u = env.users[uID]
        if ( (uID !== _userID) && u.location === loc) {
            u.messages.push(name + " says '" + msg + "'.\n")
        }
    }
    */
    broadcast(name + " says '" + msg + "'\n", _user)
    return "\nYou say '" + msg + "'\n"
}

function goLogic(args, env, system) {
    var dir = args.direction
      , _userID = system.stream.userID
      , _user = env.users[_userID]
      , userLoc = _user.location
      , loc = env.locations[userLoc]

    if (loc.exits[dir]) {
        // broadcast leaving
        /*
        for (var uID in env.users) {
            var u = env.users[uID]
            if ( (uID !== _userID) && u.location === loc) {
                u.messages.push(name + " leaves to the " + dir + ".\n")
            }
        }
        */
        broadcast(_user.name + " leaves to the " + dir + ".\n", _user)
        _user.location = loc.exits[dir]
        broadcast(_user.name + " enters the room.\n", _user)
        /*
        for (var uID in env.users) {
            var u = env.users[uID]
            if ( (uID !== _userID) && u.location === loc) {
                u.messages.push(name + " enters the room.\n")
            }
        }
        */
        return "You go " + dir + ".\n"
    }

    return "You can't go that way."
}

function connectLogic(shell, system) {
    var guestName = "Guest" + shell.parser.env.userNumber
    // Set user properties to defaults.
    shell.parser.env.users[system.stream.userID] = { 'name'     : guestName
                                                   , 'location' : 'hallway'
                                                   , 'messages' : []
                                                   }
    shell.parser.env.userNumber++

    msgChannel.addListener('message', function(data) {
        var _userID = system.stream.userID
          , _user = shell.parser.env.users[_userID]
          , userLoc = _user.location

        if (_user.name === data.username || data.location !== userLoc) {
            return
        }
        
        flushMsg('\n' + data.message, shell, system)
        
    })
    
    return [ "You are now known as "
           , guestName
           , ".\n"
           , 'Use "nick <name>" to change your nickname.\n'
           ].join('')
}

function mainLogic(shell, system) {
    var output = ''
      , messages = []
      , _user = shell.parser.env.users[system.stream.userID]

    if (_user) {
        // relay anything sent by other users
        messages = _user.messages
        for (var i in messages) {
            output += messages.pop()
        }
    }

//    ;(doMain(shell, system) {
//        mainLogic(shell, system)
//       setTimeout(doMain, 5000)
//    })(shell, system)
    
    return output
}

function flushMsg(msg, shell, system) {
    var output = [ '\n'
                 , msg
                 , shell.prompt
                 ].join('')
    system.stream.write(output)
    //util.print(msg)
}

function flushMsgs(env, system) {
//    console.log(env)
    var users = env.users
    for (var userID in users) {
        var user = users[userID]
        var output = ''
        for (var i in user.messages) {
            output += user.messages.pop()
        }
        system.stream.write(output)
    }
}

function broadcast(msg, user) {
    msgChannel.emit('message', { username : user.name
                               , location : user.location
                               , message  : msg
                               })
}

/*
 * Commands.
 *
 */
var lookCmd = { 'syntax' : ['look', 'l']
              , 'logic'  : lookLogic
              }
              
var quitCmd = { 'syntax' : ['quit', 'exit']
              , 'logic'  : quitLogic
              }

var nickCmd = { 'syntax' : ['nick <username:username>']
              , 'logic'  : nickLogic
              }

var sayCmd  = { 'syntax' : ['say <string:message*>']
              , 'logic'  : sayLogic
              }

var goCmd   = { 'syntax' : ['go <direction:direction>']
              , 'logic'  : goLogic
              }

var helpCmd = { 'syntax' : ['help']
              , 'logic'  : helpLogic
              }

var commands = { 'look' : lookCmd
               , 'quit' : quitCmd
               , 'nick' : nickCmd
               , 'go'   : goCmd
               , 'help' : helpCmd
               , 'say'  : sayCmd
               }

/*
 * Validators.
 *
 */
function directionValidator(lexeme) {
    var dirs = ['north', 'south', 'east', 'west']
    return { 'success' : (dirs.indexOf(lexeme) !== -1)
           , 'message' : "That's not a direction that I understand.\n"
           }
}

function nickValidator(lexeme) {
    return { 'success' : (userNames[lexeme] === undefined)
           , 'message' : "That name already exists. Please use another one.\n"
           }
}

/*
 * Set up stuff.
 *
 */
var parser = new Parser(commands)
parser.addValidator('direction', directionValidator)
parser.addValidator('username', nickValidator)
parser.setEnv('locations', locations)
parser.setEnv('location', 'hallway')
parser.setEnv('users', {})
parser.setEnv('userNumber', 1)

var port = process.env.PORT || 8080
var welcome = "\n\nWelcome to Erehwon...\n"

var shell = new Shell(parser)
            .set('port', process.env.PORT || 8080)
            .set('welcome', welcome)
//            .set('prompt', '$ ')
            .set('connectLogic', connectLogic)
            .set('logic', mainLogic)
            .startServer()

