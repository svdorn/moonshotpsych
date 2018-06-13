"use strict"
import React, { Component } from "react";
import { connect } from "react-redux";
import { browserHistory } from "react-router";
import { bindActionCreators } from "redux";
import { closeNotification, addNotification, answerPsychQuestion, startPsychEval } from "../../../actions/usersActions";
import axios from "axios";
import MetaTags from "react-meta-tags";
import PsychSlider from "./psychSlider";
import ProgressBar from "../../miscComponents/progressBar";
import { CircularProgress } from "material-ui";

class PsychAnalysis extends Component {
    constructor(props) {
        super(props);

        // start out with the slider in the middle
        this.state = { answer: 0 };
    }


    componentDidMount() {
        const currentUser = this.props.currentUser;
        // make sure a user is logged in
        if (!currentUser) {
            this.goTo("/login");
        }
        // if the user hasn't signed up for the test
        else if (!currentUser.psychometricTest) {
            console.log("Have to have started the psych test first!");
            // TODO: make this go to the psych analysis landing page instead of home
            this.goTo("/");
        }
        // if the user already took the test, can't do it again
        else if (currentUser.psychometricTest.inProgress === false) {
            console.log("Can only take the psych test once!");
            // TODO: make this go to the psych analysis landing page instead of home
            this.goTo("/");
        }
    }


    goTo(route) {
        // closes any notification
        this.props.closeNotification();
        // goes to the wanted page
        browserHistory.push(route);
        // goes to the top of the new page
        window.scrollTo(0, 0);
    }


    // move on to the next psych question
    nextQuestion() {
        this.props.answerPsychQuestion(this.props.currentUser._id, this.props.currentUser.verificationToken, this.state.answer);
    }


    startTest() {
        this.props.startPsychEval(this.props.currentUser._id, this.props.currentUser.verificationToken);
    }


    finishTest() {
        // if the user is taking a position evaluation, go to the next step of that
        const user = this.props.currentUser;
        const currentPosition = user.currentPosition;
        if (currentPosition) {
            // if there are skill tests the user still has to take, go to that skill test
            if (currentPosition.skillTests && currentPosition.testIndex < currentPosition.skillTests.length) {
                this.goTo(`/skillTest/${currentPosition.skillTests[currentPosition.testIndex]}`);
            }
            // otherwise, if there are free response questions to answer, go there
            else if (currentPosition.freeResponseQuestions && currentPosition.freeResponseQuestions.length > 0) {
                this.goTo("/freeResponse");
            }
            // otherwise, the user is done with the test; go home and give them
            // a notification saying they're done
            else {
                this.props.addNotification("Finished application!", "info");
                this.goTo("/");
            }
        }
        // otherwise the user took the exam as a one-off thing, so show them results
        else {
            this.goTo("/myEvaluations");
        }
    }


    updateAnswer(newAnswer) {
        this.setState({
            ...this.state,
            answer: newAnswer
        })
    }


    createContent(currentUser) {
        // if there is no current user or we're waiting for the psych test to
        // start, show loading symbol
        if (!currentUser || this.props.startingPsychTest) {
            return (
                <CircularProgress />
            );
        }

        // check if they're in a position evaluation, and if so if they can do this step yet
        if (currentUser.positionInProgress && (!currentUser.adminQuestions || !currentUser.adminQuestions.finished)) {
            return (
                <div className="center">
                    You have to complete the administrative questions first!<br/>
                    <button onClick={() => this.goTo("/adminQuestions")} className="slightlyRoundedButton marginTop10px orangeToRedButtonGradient whiteText font22px font16pxUnder600 clickableNoUnderline">
                        Take me there!
                    </button>
                </div>
            );
        }

        const psychometricTest = currentUser.psychometricTest;

        // if the user hasn't taken the psych test, ask them if they want to
        if (typeof psychometricTest !== "object" || !psychometricTest.startDate) {
            return (
                <div>
                    This is a psychometric analysis that will last around 10 minutes. Ready?
                    <br/>
                    <div className="psychAnalysisButton" style={{marginTop: "20px"}} onClick={this.startTest.bind(this)}>
                        Start!
                    </div>
                </div>
            );
        }

        // we know the user previously started the psych test
        const finishedTest = psychometricTest.inProgress === false || psychometricTest.endDate;

        // if they are finished with the test and ready to move on, give them a finish button
        if (finishedTest) {
            return (
                <div>
                    {"You're done with the psychometric analysis!"}
                    <br/>
                    <div className="psychAnalysisButton" style={{marginTop: "20px"}} onClick={this.finishTest.bind(this)}>
                        Finish
                    </div>
                </div>
            );
        }

        // user is taking the psych test currently - get the question
        const currentQuestion = psychometricTest.currentQuestion;
        if (!currentQuestion) {
            console.log("No question.");
            return (
                <div>Error</div>
            );
        }

        // get all info about the question
        const question = currentQuestion.body;
        const leftOption = currentQuestion.leftOption;
        const rightOption = currentQuestion.rightOption;
        const questionId = currentQuestion.questionId;

        if (!question || !leftOption || !rightOption) {
            console.log("Question or left option or right option not available.");
            return (
                <div>Error</div>
            );
        }

        // all is good, create styles for slider and options
        const sliderWidth = "350px";
        const topMargin = 110;
        const sliderAndAnswerContainerStyle = {
            width: sliderWidth,
            display: "inline-block",
            position: "relative"
        }

        let leftOptionStyle = {
            position: "absolute",
            height: `${topMargin/2}px`,
            display: "table",
            top: `${topMargin/4}px`,
            maxWidth: "calc(100% * 2/3)"
        }
        let rightOptionStyle = Object.assign({}, leftOptionStyle);
        leftOptionStyle.transform = "translateX(-50%)";
        leftOptionStyle.left = "0";
        rightOptionStyle.transform = "translateX(50%)";
        rightOptionStyle.right = "0";

        const optionTextStyle = {
            display: "table-cell",
            verticalAlign: "middle"
        }

        const sliderStyle = {
            marginTop: `${topMargin}px`
        }

        return (
            <div>
                <div className="center">
                    {question}
                </div>

                <div style={sliderAndAnswerContainerStyle}>
                    <div style={leftOptionStyle}>
                        <div style={optionTextStyle}>{leftOption}</div>
                    </div>
                    <div style={rightOptionStyle}>
                        <div style={optionTextStyle}>{rightOption}</div>
                    </div>

                    <PsychSlider
                        width={sliderWidth}
                        height="200px"
                        className="center"
                        style={sliderStyle}
                        updateAnswer={this.updateAnswer.bind(this)}
                        questionId={questionId}
                    />
                </div>
                <br/>
                <div className="psychAnalysisButton" onClick={this.nextQuestion.bind(this)}>
                    Next
                </div>
            </div>
        );
    }


    render() {
        // what will be shown in the main area of the page
        const currentUser = this.props.currentUser;
        let content = this.createContent(currentUser);

        const progressBar = currentUser && currentUser.positionInProgress ?
            <ProgressBar /> : null;


        return (
            <div className="blackBackground fillScreen whiteText center">
                <MetaTags>
                    <title>Psychometric Analysis | Moonshot</title>
                    <meta name="description" content={"Find out what personality type you have! This will let us know how to best help you in getting the perfect job."} />
                </MetaTags>
                <div className="employerHeader" />
                { progressBar }
                { content }
            </div>
        );
    }
}


function mapDispatchToProps(dispatch) {
    return bindActionCreators({
        closeNotification,
        answerPsychQuestion,
        startPsychEval,
        addNotification
    }, dispatch);
}

function mapStateToProps(state) {
    return {
        currentUser: state.users.currentUser,
        startingPsychTest: state.users.loadingSomething
    };
}


export default connect(mapStateToProps, mapDispatchToProps)(PsychAnalysis);
