/*
  Code proposé par Laurent Millan - Genesys <laurent.millan@genesys.com>
*/
const platformClient = require('platformClient');

//Credentials
const CLIENTID = 'MON CLIENT ID OAuth Implicit Grant PureCloud';
const REDIRECTURI = window.location.href;
const ENVIRONMENT = 'mypurecloud.ie'

var PureCloud = platformClient.ApiClient.instance;
PureCloud.setEnvironment('mypurecloud.ie');

const Routing = new platformClient.RoutingApi();
const Users = new platformClient.UsersApi();
const Analytics = new platformClient.AnalyticsApi();
const Conversations = new platformClient.ConversationsApi();
const Notifications = new platformClient.NotificationsApi();

moment.locale("fr");

const app = new Vue({
  el: '#app',
  data () {
    return {
      me: {},               // Le user connecté
      myQueues: [],         // Les queues associées au user
      selectedQueue: null,  // La quee sélectionnée
      users: []             // La liste des users pour une queue donnée
    }
  },
  computed: {
    usersForStatusAway(){
      // Les users qui ont un status de type Away
      return this.getUsersForStatus(['away', 'break', 'meal', 'training']);
    },
    usersForStatusOnQueue(){
      // Les users qui ont un status de type on queue
      return this.getUsersForStatus(['onqueue', 'on_queue']);
    },
    usersForStatusAvailable(){
      // Les users qui ont un status de type available
      return this.getUsersForStatus(['available']);
    },
    usersForStatusBusy(){
      // Les users qui ont un status de type busy
      return this.getUsersForStatus(['busy', 'meeting']);
    }
  },
  methods: {
    selectQueue(queue){
      // Sélectionne une queue
      this.selectedQueue = queue;
    },
    getTimeFromNow(time, more){
      return moment(time).fromNow(more)
    },
    onMessage(message) {
      // Réception d'un message de notification PureCloud
      var data = JSON.parse(message.data);
      if(data.topicName.match(/v2\.users\..*\.presence/gi)){
        // Si le message concerne la présence d'un user
        let userId = data.topicName.split(/v2\.users\.(.*)\.presence/gi)[1];
        this.users.forEach(u => {
          // On recherche le user dont on vient de recevoir la notification de présence
          if(u.id == userId){
            // On évite un problème du "on queue" qui peut apparaitre différemment dans les notifications
            if(u.user.presence.presenceDefinition.systemPresence.toLowerCase() == "on_queue"){
              u.user.presence.presenceDefinition.systemPresence = "onqueue";
            }
            // On change la présence du user
            u.user.presence = data.eventBody;
          }
        })
      }
    },
    getUserImage(user) {
      // Retourne le lien de l'image du user passé en paramètres
      if(!user.user.images){
        return "https://dhqbrvplips7x.cloudfront.net/directory/4447/assets/images/svg/person.svg"
      }
      else {
        return user.user.images[0].imageUri;
      }
    },
    getStatusClass(user){
      // Retourne la classe qui doit être utilisée pour afficher le cercle de couleur représentant la présence
      return "presence_" + user.user.presence.presenceDefinition.systemPresence.replace(/[ ]*/gi, "").toLowerCase();
    },
    getUsersForStatus(statusNames){
      // Retourne la liste des users dans un status donné
      return this.users.filter( user => {
        // Identifie le nom de la présence du user (je standardise en retirant les espaces et en mettant lowercase)
        let pres = user.user.presence.presenceDefinition.systemPresence.replace(/[ ]*/gi, "").toLowerCase()
        if(Array.isArray(statusNames)){
          // Si on passe un tableau de présences : on fait une regexp pour trouver l'un de ces status
          return pres.match(new RegExp(statusNames.join("|"), "gi"))
        }else{
          // Si on passe un seul status je vérifie si c'est égal au nom de statut standardisé
          return pres == statusNames;
        }
      })
    }
  },
  watch: {
    selectedQueue(){
      // Si la queue sélectionnée change
      let selectedQueue = this.selectedQueue;
      let self = this;

      let opts = {
        pageSize: 100,
        pageNumber: 1,
        expand: ["presence"]
      };

      // Je recherche la liste des users pour la queue sélectionnée
      Routing.getRoutingQueueUsers(selectedQueue.id, opts)
      .then(users => {
        console.log(users.entities);
        this.users = users.entities;

        // Je démarre un canal de notification sur chacun des utilisateurs de la queue
        Notifications.postNotificationsChannels().then( channel => {
          // J'ouvre la websocket de notification
          this.notificationsSocket = new WebSocket(channel.connectUri);
          this.notificationsSocket.onopen = function(){
            let subscriptions = self.users.map(user => {
              return {id: `v2.users.${user.id}.presence`}
            })
            // Je souscrit aux notifications (la présence de chaque utilisateur)
            Notifications.postNotificationsChannelSubscriptions(channel.id, subscriptions)
          }

          // J'attache la method "onMessage" de la vue à la méthode onmessage de la websocket
          this.notificationsSocket.onmessage = this.onMessage
        })
      })
    }
  },
  created () {
  },
  mounted (){
    // Authenticate
    PureCloud.loginImplicitGrant(CLIENTID, REDIRECTURI)
    .then(login => {
      // Récupère les infos du user connecté
      return Users.getUsersMe({ 'expand': ["presence"] }).then(me => {
        return this.me = me;
      });
    })
    .then( me => {
      // Une fois que les détails du user sont chargés
      console.log(`Hello, ${this.me.name}!`);
      // Récupère les 100 premières queues associées au user connecté
      return Users.getUserQueues(this.me.id, { pageSize: 100, pageNumber: 1 }).then( queues => {
        return this.myQueues = queues.entities;
      })
    })
    .then( queues => {
      // Le chargement des queues a été effectué
      console.log(this.myQueues);
    })
    .catch(function(response) {
      // Problème
      console.log(`${response.status} - ${response.error.message}`);
      console.log(response.error);
    });
  }
})
