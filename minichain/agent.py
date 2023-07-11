import json
from dataclasses import asdict, dataclass
from typing import Any, Dict, List, Optional, Union

from pydantic import BaseModel

from minichain.utils.cached_openai import get_openai_response
from minichain.utils.debug import debug


@dataclass
class SystemMessage:
    content: str
    role: str = "system"

    def dict(self):
        return asdict(self)


@dataclass
class UserMessage:
    content: str
    role: str = "user"
    parent: Union[
        "UserMessage", "SystemMessage", "AssistantMessage", "FunctionMessage"
    ] = None

    def dict(self):
        return asdict(self)


@dataclass
class FunctionCall:
    name: str
    arguments: Dict[str, Any]

    def dict(self):
        return asdict(self)


@dataclass
class AssistantMessage:
    content: str
    function_call: Optional[FunctionCall] = None
    role: str = "assistant"
    parent: Union[
        "UserMessage", "SystemMessage", "AssistantMessage", "FunctionMessage"
    ] = None

    def dict(self):
        return asdict(self)


@dataclass
class FunctionMessage:
    content: str
    name: str
    role: str = "function"
    parent: Optional[AssistantMessage] = None

    def dict(self):
        return asdict(self)


def make_return_function(openapi_json):
    def return_function(arguments):
        # arguments: pydantic model
        # return: json
        # json is turned into a pydantic model again by the function_obj.__call__ method
        return arguments.dict()

    function_obj = Function(
        name="return",
        function=return_function,
        openapi=openapi_json,
        description="End the conversation and return a structured response.",
    )
    return function_obj


class Agent:
    def __init__(
        self,
        functions,
        system_message,
        prompt_template="{task}".format,
        response_openapi=None,
        init_history=None,
        onUserMessage=None,
        onFunctionMessage=None,
        onAssistantMessage=None,
        keep_first_messages=1,
        keep_last_messages=20,
    ):
        functions = functions.copy()
        self.response_openapi = response_openapi
        self.has_structured_response = response_openapi is not None
        if response_openapi is not None and not any(
            [i.name == "return" for i in functions]
        ):
            functions.append(make_return_function(response_openapi))
        self.functions = functions
        self.init_history = init_history
        self.system_message = system_message
        self.history = [system_message] + (init_history or [])
        self.prompt_template = prompt_template
        self.keep_first_messages = keep_first_messages
        self.keep_last_messages = keep_last_messages

        def do_nothing(*args, **kwargs):
            pass

        self.onUserMessage = onUserMessage or do_nothing
        self.onFunctionMessage = onFunctionMessage or do_nothing
        self.onAssistantMessage = onAssistantMessage or do_nothing

        self.functions_openai = [i.openapi_json for i in self.functions]

    def history_append(self, message):
        message.parent = self.history[-1]
        self.history.append(message)

    def run(self, **arguments):
        """arguments: dict with values mentioned in the prompt template"""
        agent_session = Agent(
            self.functions,
            self.system_message,
            self.prompt_template,
            self.response_openapi,
            self.init_history,
            onUserMessage=self.onUserMessage,
            onFunctionMessage=self.onFunctionMessage,
            onAssistantMessage=self.onAssistantMessage,
            keep_first_messages=self.keep_first_messages,
            keep_last_messages=self.keep_last_messages,
        )
        agent_session.task_to_history(arguments)
        return agent_session.run_until_done()

    def run_until_done(self):
        while True:
            assistant_message = self.get_next_action()
            self.history_append(assistant_message)
            self.onAssistantMessage(self.history[-1])
            if (
                not self.has_structured_response
                and assistant_message.content is not None
            ):
                breakpoint()
                return assistant_message.content
            function_call = assistant_message.function_call
            if function_call is not None:
                output = self.execute_action(function_call)
                if function_call.name == "return":
                    return output

    def task_to_history(self, arguments):
        self.history_append(UserMessage(self.prompt_template(**arguments)))
        self.onUserMessage(self.history[-1])

    def get_next_action(self):
        # do the openai call
        indizes = list(range(len(self.history)))
        keep = (
            [indizes[0]]
            + indizes[1 : self.keep_first_messages + 1]
            + indizes[-self.keep_last_messages :]
        )
        keep = sorted(list(set(keep)))
        history = [self.history[i] for i in keep]
        response = get_openai_response(history, self.functions_openai)
        function_call = response.get("function_call", None)
        if function_call is not None:
            function_call = FunctionCall(**function_call)
        return AssistantMessage(
            response.get("content", None), function_call=function_call
        )

    @debug
    def execute_action(self, function_call):
        try:
            for function in self.functions:
                if function.name == function_call.name:
                    function_output = function(**json.loads(function_call.arguments))
                    function_output_str = function_output
                    if not isinstance(function_output, str):
                        function_output_str = json.dumps(function_output)
                    function_message = FunctionMessage(function_output_str, function.name)
                    self.history_append(function_message)
                    self.onFunctionMessage(self.history[-1])
                    return function_output
            self.history_append(
                FunctionMessage(
                    f"Error: this function does not exist", function.name
                )
            )
        except Exception as e:
            self.history_append(FunctionMessage(f"{type(e)}: {e}", function.name))
        self.onFunctionMessage(self.history[-1])
        return False

    def follow_up(self, user_message):
        self.history_append(user_message)
        self.onUserMessage(self.history[-1])
        return self.run_until_done()


class Function:
    def __init__(self, openapi, name, function, description):
        """
        Arguments:
            openapi (dict): the openapi.json describing the function
            name (str): the name of the function
            function (any -> FunctionMessage): the function to call. Must return a FunctionMessage
            description (str): the description of the function
        """
        self.pydantic_model = None
        try:
            if isinstance(openapi, dict):
                parameters_openapi = openapi
            elif issubclass(openapi, BaseModel):
                parameters_openapi = openapi.schema()
                self.pydantic_model = openapi
            else:
                raise ValueError(
                    "openapi must be a dict or a pydantic BaseModel describing the function parameters."
                )
        except:
            print(openapi, type(openapi))
            breakpoint()
        self.parameters_openapi = parameters_openapi
        self.name = name
        self.function = function
        self.description = description

    @debug
    def __call__(self, **arguments):
        if self.pydantic_model is not None:
            arguments = self.pydantic_model(**arguments)
            return self.function(arguments)
        return self.function(**arguments)

    @property
    def openapi_json(self):
        return {
            "name": self.name,
            "description": self.description,
            "parameters": self.parameters_openapi,
        }
