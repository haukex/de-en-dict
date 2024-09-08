# State Machine Documentation

**DRAFT**

```
          Main                             Worker
    ----------------                  ----------------
               Init -----------------> (Init)
                 |                      V
       [dom loaded]      <-[progress]- LoadingDict
                 V                      |
  +--> AwaitingDict -[status?]->        |
  |              |                      |
  +-+-[timeout]--+                      |
    V           /| <--[loaded/error]--- +----> Error
   Error <-----/ |                      |
    ^            V                      V
+---|-------> Ready                    Ready <---------+
|   |            |                      |              |
|   |         [user] ---[search]------> |              |
|   |            |                      |              |
|   |            V                      V              |
|   |     Searching      <-[progress]- (Searching)     |
|   |            |                      |              |
|   +-[timeout]--+                      |              |
|                | <------[done]------- |              |
+----------------+                      +--------------+
```

## Main (UI) Thread

1. `Init`
    - On initialization, the Worker is immediately initialized, but its message listener is not yet set up.
    - On `DOMContentLoaded`, transition to the next state:
2. `AwaitingDict`
    - Upon entering this state:
      - Set up the message listener for the Worker.
      - Send a status request to the Worker
        (which I think in theory may even arrive before the worker is started, hence the need for a timeout).
      - A timer is set up to trigger a timeout.
    - On timeout, remain in this state, but send another status request to the Worker.
      After a few retries without getting a progress report from the Worker, enter the `Error` state.
    - On reception of a message saying that there was an error loading the dictionary, stop the timeout timer
      and go to state `Error`.
    - On reception of a message saying the dictionary is loaded, stop the timeout timer and go to `Ready`.
      - Only at this time is the `hashchange` event listener installed, and an initial `searchFromUrl` triggered,
        TODO: which may transition to `Searching` immediately?
3. `Ready`
    - Idle state, can only be exited by user input, including a hash change.
    - When a search is initiated, the corresponding request is sent to the Worker.
4. `Searching`
    - When entering this state, set up a timer for timeout.
    - The timeout timer is reset every time a progress message is received.
    - When exiting the state, cancel the timer.

## Worker Thread

1. On initialization, immediately begin loading the dictionary.
  This transition is synchronous, hence no need for a corresponding state.
2. `LoadingDict`
    - Periodically sends progress reports to the main thread,
      and most importantly, send a message when loading is done or an error is encountered.
    - Assuming the main thread's state machine is working correctly,
      search requests in this state should not happen and are ignored.
    - When there is an error loading the dictionary, transition to `Error`.
    - When the dictionary is loaded successfully, transition to the next state:
3. `Ready`
    - Idle state. On reception of a search request, perform the search.
4. The search operation is synchronous, so there is no need for a corresponding state.
    - Periodic status updates may be sent if the search is slow.
    - The results are sent back on completion of the search.

Status report requests from the main thread are always answered with the current state.

### Background Dictionary Updates

The Worker thread may run a background dictionary update after loading the dictionary.
Since this does not affect the operation of the main thread or the Worker, this can
happen asynchronously and is simply reported with a separate message.
